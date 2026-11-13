// A WGSL module that does not compile, on the shared device: an uncaptured GPU validation error.
import { getWebGPUDevice } from "@hmplot/jax";
export function provokeValidationError() {
  getWebGPUDevice().createShaderModule({ code: "@compute @workgroup_size(1) fn main() { let x: f32 = undefined_name; }" });
}
