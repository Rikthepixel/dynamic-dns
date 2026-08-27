export enum ResultType {
  Success,
  Error,
}

export type Result<T, E = Error> = (
  | { type: ResultType.Success; value: T; isSuccess: true; isError: false }
  | { type: ResultType.Error; value: E; isSuccess: false; isError: true }
) & {
  unwrapOr<TDefault>(fallback: TDefault): T | TDefault;
  unwrap(): T;
};

export function valueIntoResult<T, E>(value: T): Result<T, E> {
  return {
    type: ResultType.Success,
    value,
    isError: false,
    isSuccess: true,
    unwrapOr: () => value,
    unwrap: () => value,
  };
}

export function errorIntoResult<T, E>(value: E): Result<T, E> {
  return {
    type: ResultType.Error,
    value,
    isError: true,
    isSuccess: false,
    unwrapOr: (fallback) => fallback,
    unwrap() {
      throw value;
    },
  };
}

export async function promiseIntoResult<T, E = Error>(
  promise: Promise<T>,
): Promise<Result<T, E>> {
  return await promise
    .then((value) => valueIntoResult<T, E>(value))
    .catch((error) => errorIntoResult<T, E>(error));
}
