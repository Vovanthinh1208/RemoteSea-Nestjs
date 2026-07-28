import { CircuitBreaker } from "./circuit-breaker";

describe("CircuitBreaker", () => {
  it("starts closed and stays closed under the failure threshold", () => {
    const breaker = new CircuitBreaker(3, 1000);

    breaker.onFailure(0);
    breaker.onFailure(0);

    expect(breaker.getState()).toBe("closed");
    expect(breaker.isOpen(0)).toBe(false);
  });

  it("opens once consecutive failures reach the threshold", () => {
    const breaker = new CircuitBreaker(3, 1000);

    breaker.onFailure(0);
    breaker.onFailure(0);
    breaker.onFailure(0);

    expect(breaker.getState()).toBe("open");
    expect(breaker.isOpen(0)).toBe(true);
  });

  it("a success resets the consecutive-failure count", () => {
    const breaker = new CircuitBreaker(3, 1000);

    breaker.onFailure(0);
    breaker.onFailure(0);
    breaker.onSuccess();
    breaker.onFailure(0);
    breaker.onFailure(0);

    // Only 2 consecutive failures since the reset — still under threshold.
    expect(breaker.getState()).toBe("closed");
  });

  it("stays open until the cooldown elapses", () => {
    const breaker = new CircuitBreaker(1, 1000);
    breaker.onFailure(0);

    expect(breaker.isOpen(500)).toBe(true);
    expect(breaker.isOpen(999)).toBe(true);
  });

  it("transitions to half-open once the cooldown has elapsed", () => {
    const breaker = new CircuitBreaker(1, 1000);
    breaker.onFailure(0);

    expect(breaker.isOpen(1000)).toBe(false);
    expect(breaker.getState()).toBe("half-open");
  });

  it("closes on a successful half-open trial", () => {
    const breaker = new CircuitBreaker(1, 1000);
    breaker.onFailure(0);
    breaker.isOpen(1000); // -> half-open
    breaker.onSuccess();

    expect(breaker.getState()).toBe("closed");
    expect(breaker.isOpen(1000)).toBe(false);
  });

  it("re-opens immediately on a failed half-open trial, without needing the full threshold again", () => {
    const breaker = new CircuitBreaker(5, 1000);
    for (let i = 0; i < 5; i += 1) breaker.onFailure(0);
    breaker.isOpen(1000); // -> half-open

    breaker.onFailure(1000);

    expect(breaker.getState()).toBe("open");
    expect(breaker.isOpen(1000)).toBe(true);
    expect(breaker.isOpen(2000)).toBe(false); // new cooldown window from 1000
  });
});
