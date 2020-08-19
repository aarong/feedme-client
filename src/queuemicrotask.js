import queueMicrotask from "queue-microtask";

export default function(fn, ...args) {
  queueMicrotask(() => {
    fn(...args);
  });
}
