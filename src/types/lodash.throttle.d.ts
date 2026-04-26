declare module "lodash.throttle" {
  type AnyFn = (...args: any[]) => any;

  export default function throttle<T extends AnyFn>(
    func: T,
    wait?: number,
    options?: { leading?: boolean; trailing?: boolean }
  ): T;
}

