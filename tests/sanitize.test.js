/**
 * Sanitization Middleware Tests.
 */

const express = require("express");
const request = require("supertest");
const { trimStrings } = require("../src/middleware/sanitize");

describe("Sanitization Middleware", () => {
  let app;

  beforeAll(() => {
    app = express();
    app.use(express.json());
    app.use(trimStrings);

    app.post("/test-sanitize", (req, res) => {
      res.json({
        body: req.body,
        query: req.query,
        params: req.params,
      });
    });
  });

  test("should trim string values recursively and remove null bytes", async () => {
    const payload = {
      name: "   John Doe   ",
      nested: {
        email: "  john@example.com\0  ",
      },
      array: ["  one  ", "  two\0  "],
    };

    const res = await request(app)
      .post("/test-sanitize")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({
      name: "John Doe",
      nested: {
        email: "john@example.com",
      },
      array: ["one", "two"],
    });
  });

  test("should remove MongoDB operators ($ and .) from keys recursively", async () => {
    const payload = {
      "$gt": 10,
      "nested.field": {
        "$ne": "value",
      },
      "array": [
        { "nested.key": "trimmed " }
      ]
    };

    const res = await request(app)
      .post("/test-sanitize")
      .send(payload);

    expect(res.status).toBe(200);
    expect(res.body.body).toEqual({
      "gt": 10,
      "nestedfield": {
        "ne": "value",
      },
      "array": [
        { "nestedkey": "trimmed" }
      ]
    });
  });

  test("should sanitize query parameters in-place without reassigning req.query", async () => {
    const res = await request(app)
      .post("/test-sanitize?name=  Alice  &nested.key=value&nested[$gt]=10")
      .send({});

    expect(res.status).toBe(200);
    expect(res.body.query).toEqual({
      "name": "Alice",
      "nestedkey": "value",
      "nested[gt]": "10",
    });
  });
});
