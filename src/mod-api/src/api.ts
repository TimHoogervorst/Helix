/** Authenticated, same-origin API client supplied by the Helix shell. */
export {
  get,
  post,
  put,
  patch,
  del,
  isNotFoundError,
  ApiError,
  NetworkError,
} from "../../shell/src/api/client";
