/** Authenticated, same-origin API client supplied by the Helix shell. */
export {
  get,
  getText,
  post,
  upload,
  put,
  patch,
  del,
  isNotFoundError,
  ApiError,
  NetworkError,
} from "../../shell/src/api/client";
