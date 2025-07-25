/* Copyright 2024 Marimo. All rights reserved. */
import { describe, expect, it } from "vitest";
import { determineMaxDisplayLength, getCopyValue } from "../JsonOutput";

describe("getCopyValue", () => {
  it("should handle strings without MIME prefixes", () => {
    const value = "simple string";
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`""simple string""`);
  });

  it("should handle strings with MIME prefixes", () => {
    const value = "text/plain:Hello, World!";
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`""Hello, World!""`);
  });

  it("should handle booleans", () => {
    expect(getCopyValue(true)).toMatchInlineSnapshot(`"True"`);
    expect(getCopyValue(false)).toMatchInlineSnapshot(`"False"`);
  });

  it("should handle null and undefined", () => {
    expect(getCopyValue(null)).toMatchInlineSnapshot(`"None"`);
    expect(getCopyValue(undefined)).toMatchInlineSnapshot(`"None"`);
  });

  it("should handle arrays", () => {
    const value = ["text/plain:Hello", true, null];
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`
      "[
        "Hello",
        True,
        None
      ]"
    `);
  });

  it("should handle objects", () => {
    const value = {
      key1: "text/plain:Hello",
      key2: false,
      key3: null,
    };
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(
      `
      "{
        "key1": "Hello",
        "key2": False,
        "key3": None
      }"
    `,
    );
  });

  it("should handle a string called true and None", () => {
    const value = {
      true: "true",
      None: "none",
      null: "null",
      sentence: "something true none null something",
    };
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(
      `
      "{
        "true": "true",
        "None": "none",
        "null": "null",
        "sentence": "something true none null something"
      }"
    `,
    );
  });

  it("should handle nested objects", () => {
    const value = {
      key1: {
        nestedKey1: "text/plain:Nested Hello",
        nestedKey2: true,
      },
      key2: false,
    };
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(
      `
      "{
        "key1": {
          "nestedKey1": "Nested Hello",
          "nestedKey2": True
        },
        "key2": False
      }"
    `,
    );
  });

  it("should handle nested arrays", () => {
    const value = ["text/plain:Hello", [true, null, "text/plain:World"]];
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`
      "[
        "Hello",
        [
          True,
          None,
          "World"
        ]
      ]"
    `);
  });

  it("should handle empty objects", () => {
    const value = {};
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`"{}"`);
  });

  it("should handle empty arrays", () => {
    const value: string[] = [];
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`"[]"`);
  });

  it("should handle numbers", () => {
    const value = 42;
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`"42"`);
  });

  it("should handle special characters in strings", () => {
    const value = "text/plain:Hello, \nWorld!";
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`""Hello, \\nWorld!""`);
  });

  it("should handle mixed types in arrays", () => {
    const value = [42, "text/plain:Hello", true, null];
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`
      "[
        42,
        "Hello",
        True,
        None
      ]"
    `);
  });

  it("should handle mixed types in objects", () => {
    const value = {
      key1: 42,
      key2: "text/plain:Hello",
      key3: true,
      key4: null,
      key5: "text/plain+float:1.23",
    };
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(
      `
      "{
        "key1": 42,
        "key2": "Hello",
        "key3": True,
        "key4": None,
        "key5": 1.23
      }"
    `,
    );
  });

  it("should handle sets", () => {
    const value = "text/plain+set:[1,2,3]";
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`"{1,2,3}"`);
  });

  it("should handle sets in mixed types", () => {
    const value = {
      key1: 42,
      key2: "text/plain+set:[1,2,3]",
      key3: true,
    };
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(
      `
      "{
        "key1": 42,
        "key2": {1,2,3},
        "key3": True
      }"
    `,
    );
  });

  it("should handle tuples", () => {
    const value = "text/plain+tuple:[1,2,3]";
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(`"(1,2,3)"`);
  });

  it("should handle tuples in mixed types", () => {
    const value = {
      key1: 42,
      key2: "text/plain+tuple:[1,2,3]",
      key3: true,
    };
    const result = getCopyValue(value);
    expect(result).toMatchInlineSnapshot(
      `
      "{
        "key1": 42,
        "key2": (1,2,3),
        "key3": True
      }"
    `,
    );
  });
});

describe("determineMaxDisplayLength", () => {
  const sample2DArray = [
    [1, 2, 3],
    [4, 5, 6],
    [7, 8, 9],
    [10, 11, 12],
    [13, 14, 15],
    [16, 17, 18],
    [19, 20, 21],
    [22, 23, 24],
    [25, 26, 27],
    [28, 29, 30],
  ];

  it("should return undefined for 1 level arrays", () => {
    const value = [1, 2, 3];
    const result = determineMaxDisplayLength(value);
    expect(result).toBeUndefined();
  });

  it("should return undefined for 2 level arrays with less than 20 items", () => {
    const value = sample2DArray;
    const result = determineMaxDisplayLength(value);
    expect(result).toBeUndefined();
  });

  it("should return 10 for 2 level arrays with more than 20 items", () => {
    const longArray = Array.from({ length: 21 }, (_, i) => i);
    const value = [...sample2DArray, longArray];
    const result = determineMaxDisplayLength(value);
    expect(result).toBe(10);
  });

  it("should return 5 for 2 level arrays with more than 50 items", () => {
    const longArray = Array.from({ length: 51 }, (_, i) => i);
    const value = [...sample2DArray, longArray];
    const result = determineMaxDisplayLength(value);
    expect(result).toBe(5);
  });

  it("should return 5 for 3 level arrays with more than 20 items", () => {
    const longArray = Array.from({ length: 21 }, (_, i) => i);
    const value = [[...sample2DArray], [...sample2DArray, longArray]];
    const result = determineMaxDisplayLength(value);
    expect(result).toBe(5);
  });
});
