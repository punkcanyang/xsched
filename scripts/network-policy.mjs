// Only the test's top-level fixture navigation and the browser's favicon are allowed.
// A fetch of an otherwise allowed document URL must still fail.
export function allowedRequest({ url, type, navigation, extensionInitiator = false, userNavigation = false }, navigations) {
  // A physical test click explicitly authorizes ONE known top-level navigation.
  // It is a page navigation, not a resource/background request. Default stays strict.
  if (extensionInitiator && !(userNavigation && type.toLowerCase() === "document" && navigation && navigations.has(url))) return false;
  if (type.toLowerCase() === "document") return navigation && navigations.has(url);
  return type.toLowerCase() === "other" && url === "https://x.com/favicon.ico";
}

export function hasExtensionInitiator(initiator) {
  for (let stack = initiator?.stack; stack; stack = stack.parent) {
    if (stack.callFrames?.some((frame) => frame.url.startsWith("chrome-extension://"))) return true;
  }
  return initiator?.url?.startsWith("chrome-extension://") || false;
}
