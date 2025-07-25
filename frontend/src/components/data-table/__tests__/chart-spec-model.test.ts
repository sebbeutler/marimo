/* Copyright 2024 Marimo. All rights reserved. */
import { describe, expect, it, vi } from "vitest";
import { ColumnChartSpecModel } from "../chart-spec-model";
import type { ColumnHeaderStats, ColumnName, FieldTypes } from "../types";

// Mock the runtime config
vi.mock("@/core/runtime/config", () => ({
  asRemoteURL: vi.fn((path: string) => {
    if (path.startsWith("http")) {
      return new URL(path);
    }
    return new URL(path, "http://localhost:8080/");
  }),
}));

describe("ColumnChartSpecModel", () => {
  const mockData = "http://example.com/data.json";
  const mockFieldTypes: FieldTypes = {
    date: "date",
    number: "number",
    integer: "integer",
    boolean: "boolean",
    string: "string",
  };
  const mockStats: Record<ColumnName, ColumnHeaderStats> = {
    date: { min: "2023-01-01", max: "2023-12-31" },
    number: { min: 0, max: 100 },
    integer: { min: 1, max: 10 },
    boolean: { true: 5, false: 5 },
    string: { unique: 20 },
  };

  it("should create an instance", () => {
    const model = new ColumnChartSpecModel(
      mockData,
      mockFieldTypes,
      mockStats,
      { includeCharts: true },
    );
    expect(model).toBeInstanceOf(ColumnChartSpecModel);
  });

  it("should return EMPTY for static EMPTY property", () => {
    expect(ColumnChartSpecModel.EMPTY).toBeInstanceOf(ColumnChartSpecModel);
    expect(ColumnChartSpecModel.EMPTY.stats).toEqual({});
  });

  it("should return header summary with spec when includeCharts is true", () => {
    const model = new ColumnChartSpecModel(
      mockData,
      mockFieldTypes,
      mockStats,
      { includeCharts: true },
    );
    const dateSummary = model.getHeaderSummary("date");
    expect(dateSummary.stats).toEqual(mockStats.date);
    expect(dateSummary.type).toBe("date");
    expect(dateSummary.spec).toBeDefined();
  });

  it("should return header summary without spec when includeCharts is false", () => {
    const model = new ColumnChartSpecModel(
      mockData,
      mockFieldTypes,
      mockStats,
      { includeCharts: false },
    );
    const numberSummary = model.getHeaderSummary("number");
    expect(numberSummary.stats).toEqual(mockStats.number);
    expect(numberSummary.type).toBe("number");
    expect(numberSummary.spec).toBeUndefined();
  });

  it("should return null spec for string and unknown types", () => {
    const model = new ColumnChartSpecModel(
      mockData,
      mockFieldTypes,
      mockStats,
      { includeCharts: true },
    );
    const stringSummary = model.getHeaderSummary("string");
    expect(stringSummary.spec).toBeNull();
  });

  it("should handle special characters in column names", () => {
    const specialFieldTypes: FieldTypes = {
      "column.with[special:chars]": "number",
    };
    const specialStats: Record<ColumnName, ColumnHeaderStats> = {
      "column.with[special:chars]": { min: 0, max: 100 },
    };
    const model = new ColumnChartSpecModel(
      mockData,
      specialFieldTypes,
      specialStats,
      { includeCharts: true },
    );
    const summary = model.getHeaderSummary("column.with[special:chars]");
    expect(summary.spec).toBeDefined();
    expect(
      // @ts-expect-error layer should be available
      (summary.spec?.layer[0].encoding?.x as { field: string })?.field,
    ).toBe("column\\.with\\[special\\:chars\\]");
  });

  describe("snapshot", () => {
    const fieldTypes: FieldTypes = {
      ...mockFieldTypes,
      a: "number",
    };

    it("url data", () => {
      const model = new ColumnChartSpecModel(mockData, fieldTypes, mockStats, {
        includeCharts: true,
      });
      expect(model.getHeaderSummary("date").spec).toMatchSnapshot();
    });

    it("csv data", () => {
      const model = new ColumnChartSpecModel(
        `data:text/csv;base64,${btoa("a,b,c\n1,2,3\n4,5,6")}`,
        fieldTypes,
        mockStats,
        { includeCharts: true },
      );
      expect(model.getHeaderSummary("a").spec).toMatchSnapshot();
    });

    it("csv string", () => {
      const model = new ColumnChartSpecModel(
        "a,b,c\n1,2,3\n4,5,6",
        fieldTypes,
        mockStats,
        { includeCharts: true },
      );
      expect(model.getHeaderSummary("a").spec).toMatchSnapshot();
    });

    it("array", () => {
      const model = new ColumnChartSpecModel(
        ["a", "b", "c"],
        fieldTypes,
        mockStats,
        { includeCharts: true },
      );
      expect(model.getHeaderSummary("a").spec).toMatchSnapshot();
    });
  });

  describe("file URL handling", () => {
    it("should handle marimo file URLs with ./@file prefix", () => {
      const model = new ColumnChartSpecModel(
        "./@file/data.csv",
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );

      const summary = model.getHeaderSummary("date");
      expect(summary.spec).toBeDefined();
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.url).toBe("http://localhost:8080/@file/data.csv");
    });

    it("should handle marimo file URLs with /@file prefix", () => {
      const model = new ColumnChartSpecModel(
        "/@file/data.csv",
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );

      const summary = model.getHeaderSummary("date");
      expect(summary.spec).toBeDefined();
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.url).toBe("http://localhost:8080/@file/data.csv");
    });

    it("should handle absolute HTTP URLs", () => {
      const model = new ColumnChartSpecModel(
        "https://external.com/data.csv",
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );

      const summary = model.getHeaderSummary("date");
      expect(summary.spec).toBeDefined();
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.url).toBeUndefined();
    });

    it("should handle data URLs", () => {
      const dataUrl = "data:text/csv;base64,YSxiLGMKMSwyLDMKNCw1LDY=";
      const model = new ColumnChartSpecModel(
        dataUrl,
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );

      const summary = model.getHeaderSummary("date");
      expect(summary.spec).toBeDefined();
      // Data URLs should be handled by parseCsvData, not as URL
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.values).toBeDefined();
    });

    it("should handle CSV string data", () => {
      const csvString = "a,b,c\n1,2,3\n4,5,6";
      const model = new ColumnChartSpecModel(
        csvString,
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );

      const summary = model.getHeaderSummary("date");
      expect(summary.spec).toBeDefined();
      // CSV strings should be parsed, not treated as URLs
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.values).toBeDefined();
    });

    it("should handle arrow data", () => {
      const arrowData = "ARROW1\n";
      const model = new ColumnChartSpecModel(
        `data:text/plain;base64,${btoa(arrowData)}`,
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );
      const spec = model.getHeaderSummary("date").spec;
      expect(spec).toMatchSnapshot();
      expect(spec?.data?.format?.type).toBe("arrow");
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.values).toBeDefined();
    });

    it("should handle array data", () => {
      const arrayData = [
        { a: 1, b: 2, c: 3 },
        { a: 4, b: 5, c: 6 },
      ];
      const model = new ColumnChartSpecModel(
        arrayData,
        mockFieldTypes,
        mockStats,
        { includeCharts: true },
      );

      const summary = model.getHeaderSummary("date");
      expect(summary.spec).toBeDefined();
      // @ts-expect-error accessing internal dataSpec
      expect(model.dataSpec?.values).toEqual(arrayData);
    });
  });
});
