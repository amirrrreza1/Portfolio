type CodeLoaderVisualProps = {
  readonly state?: "loading" | "leaving";
  readonly kind?: "page" | "route";
};

/**
 * Shared loader artwork for the hydrated page-ready gate and Next's route
 * fallback. Keeping the artwork server-safe means navigation can display it
 * before the destination JavaScript has loaded.
 */
export default function CodeLoaderVisual({
  state = "loading",
  kind = "page",
}: CodeLoaderVisualProps) {
  return (
    <div
      className="site-loader"
      data-state={state}
      data-loader-kind={kind}
      role="status"
      aria-live="polite"
      aria-label="Loading portfolio"
    >
      <div className="site-loader__content" aria-hidden="true">
        <p className="site-loader__eyebrow">AA / Portfolio</p>
        <div className="site-loader__code">
          <p className="site-loader__line">
            <span className="site-loader__line-number">01</span>
            <span>
              <span className="site-loader__keyword">const</span> page ={" "}
              <span className="site-loader__keyword">await</span> ready()
            </span>
          </p>
          <p className="site-loader__line">
            <span className="site-loader__line-number">02</span>
            <span>page.load([&quot;work&quot;, &quot;writing&quot;])</span>
          </p>
          <p className="site-loader__line">
            <span className="site-loader__line-number">03</span>
            <span>
              page.render()
              <span className="site-loader__cursor" />
            </span>
          </p>
        </div>

        <div className="site-loader__status">
          <span>Compiling interface</span>
          <span className="site-loader__count">00—100</span>
        </div>
        <div className="site-loader__track">
          <span />
        </div>
      </div>
    </div>
  );
}
