// Live test of the GitHub Repos ADO extension: deliberate lint errors so validate fails with annotations. Removed straight after.
export function liveTestAnnotation(): number {
  const unused = 1;
  debugger;
  return 2;
}
