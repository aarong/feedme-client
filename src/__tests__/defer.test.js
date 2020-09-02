import delay from "delay";
import defer from "../defer";

it("should correctly handle a callback invocation that returns successfully", async () => {
  const uncaughtExceptionListener = jest.fn();
  process.on("uncaughtException", uncaughtExceptionListener);

  const unhandledRejectionListener = jest.fn();
  process.on("unhandledRejection", unhandledRejectionListener);

  const cb = jest.fn();
  defer(cb, "some", "args");

  expect(cb.mock.calls.length).toBe(0);

  await delay(0);

  expect(cb.mock.calls.length).toBe(1);
  expect(cb.mock.calls[0].length).toBe(2);
  expect(cb.mock.calls[0][0]).toBe("some");
  expect(cb.mock.calls[0][1]).toBe("args");

  await delay(0); // Move past timeout

  expect(uncaughtExceptionListener.mock.calls.length).toBe(0);
  expect(unhandledRejectionListener.mock.calls.length).toBe(0);

  process.removeAllListeners();
});

it("should correctly handle a callback invocation that throws an error", async () => {
  // There is currently no way to test uncaughtExceptions and unhandledRejections in Jest
  // https://github.com/facebook/jest/issues/5620
  // Uncomment this test to verify that an uncaughtException event is thrown
  // And see how Jest's functionality evolves
  // const uncaughtExceptionListener = jest.fn();
  // process.on("uncaughtException", uncaughtExceptionListener);
  // const unhandledRejectionListener = jest.fn();
  // process.on("unhandledRejection", unhandledRejectionListener);
  // const err = new Error("SOME_ERROR");
  // const cb = jest.fn(() => {
  //   throw err;
  // });
  // defer(cb);
  // expect(cb.mock.calls.length).toBe(0);
  // await delay(0);
  // expect(cb.mock.calls.length).toBe(1);
  // expect(cb.mock.calls[0].length).toBe(0);
  // await delay(0); // Move past timeout
  // expect(uncaughtExceptionListener.mock.calls.length).toBe(1);
  // expect(uncaughtExceptionListener.mock.calls[0].length).toBe(1);
  // expect(uncaughtExceptionListener.mock.calls[0][0]).toBe(err);
  // expect(unhandledRejectionListener.mock.calls.length).toBe(0);
  // process.removeAllListeners();
});
