if (typeof window !== "undefined") {
  import("vanilla-lazyload").then((mod) => {
    const LazyLoad = mod.default;
    const instance = new LazyLoad({
      elements_selector: ".lazy-img",
      threshold: 200,
    });
    const observer = new MutationObserver(() => instance.update());
    observer.observe(document.body, { childList: true, subtree: true });
  });
}
