# Copyright 2024 Marimo. All rights reserved.
from __future__ import annotations

import types
import weakref
from dataclasses import dataclass
from typing import Any, Callable, Generic, Optional, TypeVar
from uuid import uuid4

from marimo._output.rich_help import mddoc
from marimo._runtime.context import ContextNotInitializedError, get_context

T = TypeVar("T")
Id = int


@dataclass
class StateItem(Generic[T]):
    id: Id
    ref: weakref.ref[State[T]]


def extract_name(key: str) -> str:
    # Some variables may use a state internally, as such the lookup needs a
    # context qualifier. We delimit the context and name with a colon, which is
    # not a valid python variable name character.
    return key.split(":")[-1]


def contextualize_name(key: str, context: Optional[str]) -> str:
    if context is None:
        return key
    return f"{context}:{key}"


class StateRegistry:
    def __init__(self) -> None:
        # variable name -> state
        # State registry is pruned based on the variable definitions in scope.
        self._states: dict[str, StateItem[Any]] = {}
        # id -> variable name for state
        # NB. python reuses IDs, but an active pruning of the registry should
        # help protect against this.
        self._inv_states: dict[Id, set[str]] = {}

    def register(
        self,
        state: State[T],
        name: Optional[str] = None,
        context: Optional[str] = None,
    ) -> None:
        if name is None:
            name = str(uuid4())
        name = contextualize_name(name, context)

        if id(state) in self._inv_states:
            ref = next(iter(self._inv_states[id(state)]))
            # Check for duplicate state ids and clean up accordingly
            if ref not in self._states or id(self._states[ref].ref()) != id(
                state
            ):
                for ref in self._inv_states[id(state)]:
                    self._states.pop(ref, None)
                self._inv_states[id(state)].clear()
        state_item = StateItem(id(state), weakref.ref(state))
        self._states[name] = state_item
        id_to_ref = self._inv_states.get(id(state), set())
        id_to_ref.add(name)
        self._inv_states[id(state)] = id_to_ref
        finalizer = weakref.finalize(state, self._delete, name, state_item)
        # No need to clean up the registry at program teardown
        finalizer.atexit = False

    def register_scope(
        self, glbls: dict[str, Any], defs: Optional[set[str]] = None
    ) -> None:
        """Finds instances of state and scope, and adds them to registry if not
        already present."""
        if defs is None:
            defs = set(glbls.keys())
        for variable in defs:
            lookup = glbls.get(variable, None)
            if isinstance(lookup, State):
                self.register(lookup, variable)

    def _delete(self, name: str, state_item: StateItem[T]) -> None:
        return self.delete(name, state_item.ref())

    def delete(
        self,
        name: str,
        state: Optional[State[T]] = None,
        context: Optional[str] = None,
    ) -> None:
        name = contextualize_name(name, context)
        saved_state = self._states.pop(name, None)
        state_id = id(state)
        if saved_state and state_id != saved_state.id:
            self.delete(name, saved_state.ref())

        if state and name in self._inv_states.get(state_id, set()):
            del self._inv_states[state_id]

    def retain_active_states(self, active_variables: set[str]) -> None:
        """Retains only the active states in the registry."""
        # Remove all non-active states by name
        active_state_ids = set()
        for state_key in list(self._states.keys()):
            if extract_name(state_key) not in active_variables:
                id_key = id(self._states[state_key])
                lookup = self._inv_states.get(id_key, None)
                if lookup is not None:
                    if state_key in lookup:
                        lookup.remove(state_key)
                    if not lookup:
                        del self._inv_states[id_key]
                del self._states[state_key]
            else:
                active_state_ids.add(self._states[state_key].id)

        # Remove all non-active states by id
        for state_id in list(self._inv_states.keys()):
            if state_id not in active_state_ids:
                del self._inv_states[state_id]

    def lookup(
        self, name: str, context: Optional[str] = None
    ) -> Optional[State[T]]:
        name = contextualize_name(name, context)
        if name in self._states:
            return self._states[name].ref()
        return None

    def bound_names(self, state: State[T]) -> set[str]:
        if id(state) in self._inv_states:
            return self._inv_states[id(state)]
        return set()


class State(Generic[T]):
    """Mutable reactive state"""

    def __init__(
        self,
        value: T,
        allow_self_loops: bool = False,
        _registry: Optional[StateRegistry] = None,
        _name: Optional[str] = None,
        _context: Optional[str] = None,
    ) -> None:
        self._value = value
        self.allow_self_loops = allow_self_loops
        self._set_value = SetFunctor(self)

        try:
            if _registry is None:
                _registry = get_context().state_registry
            _registry.register(self, _name, _context)
        except ContextNotInitializedError:
            # Registration may be picked up later, but there is nothing to do
            # at this point.
            pass

    def __call__(self) -> T:
        return self._value


class SetFunctor(Generic[T]):
    """Typed function tied to a state instance"""

    def __init__(self, state: State[T]):
        self._state = state

    def __call__(self, update: T | Callable[[T], T]) -> None:
        self._state._value = (
            update(self._state._value)  # type: ignore[assignment]
            if isinstance(update, (types.MethodType, types.FunctionType))
            else update  # type: ignore[assignment]
        )
        try:
            ctx = get_context()
        except ContextNotInitializedError:
            return
        ctx.register_state_update(self._state)


@mddoc
def state(
    value: T, allow_self_loops: bool = False
) -> tuple[State[T], Callable[[T], None]]:
    """
    Mutable reactive state.

    Warning: reactive state is an advanced feature that you likely don't need;
    it makes it possible to introduce cycles and hard-to-debug code execution
    paths. **In almost all cases, you should prefer using marimo's built-in
    [reactive execution](https://docs.marimo.io/guides/reactivity) and
    [interactivity](https://docs.marimo.io/guides/interactivity).**

    This function takes an initial value and returns:

    - a getter function that reads the state value
    - a setter function to set the state's value

    When you call the setter function and update the state value in one cell,
    all *other* cells that read any global variables assigned to the getter
    will automatically run. By default, the cell that called the setter
    function won't be re-run, even if it references the getter. To allow a
    state setter to possibly run the caller cell, set the keyword argument
    `allow_self_loops=True`.

    You can use this function with `UIElement` `on_change` handlers to trigger
    side-effects when an element's value is updated; however, you should
    prefer using marimo's built-in [reactive execution for interactive
    elements](https://docs.marimo.io/guides/interactivity).

    For example, you can tie multiple UI elements to derive their values from
    shared state.

    Examples:
      Create state:
      ```python
      get_count, set_count = mo.state(0)
      ```
      Read the value:
      ```python
      get_count()
      ```
      Update the state:
      ```python
      set_count(1)
      ```
      Update based on current value:
      ```python
      set_count(lambda value: value + 1)
      ```

    Never mutate the state directly. You should only change its value through
    its setter.

    **Synchronizing multiple UI elements:**
      ```python
      get_state, set_state = mo.state(0)
      ```
      ```python
      # Updating the state through the slider will recreate the number (below)
      slider = mo.ui.slider(0, 100, value=get_state(), on_change=set_state)
      ```
      ```python
      # Updating the state through the number will recreate the slider (above)
      number = mo.ui.number(0, 100, value=get_state(), on_change=set_state)
      ```
      ```python
      # slider and number are synchronized to have the same value (try it!)
      [slider, number]
      ```

    Warning:
      Do not store `marimo.ui` elements in state; doing so can cause
      hard-to-diagnose bugs.

    Args:
      value: Initial value of the state.
      allow_self_loops: If True, a cell that calls a state setter and also
        references its getter will be re-run. Defaults to False.

    Returns:
      A tuple of (getter function, setter function). The getter function
      retrieves the state value; the setter function takes a new value or a
      function that updates the current value.
    """
    state_instance = State(value, allow_self_loops=allow_self_loops)
    return state_instance, state_instance._set_value
