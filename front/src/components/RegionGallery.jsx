import { resolveBackendMediaUrl } from '../utils/apiMediaUrl';
import {
  CARD_PLACEHOLDER_SVG,
  displayImageSrc,
} from '../utils/placeholderImage';
const SUMMARY_FALLBACK = '광주·전남 추천 스팟 정보를 확인해보세요.';

export default function RegionGallery({ regions, onSelect }) {
  const normalizeSummary = summary => {
    const text = String(summary || '').trim();
    if (!text) return SUMMARY_FALLBACK;
    return text;
  };

  return (
    <section className="gallery-scroll-area">
      <div className="region-grid">
        {regions.map(region => {
          return (
            <article key={region.id} className="region-card">
              <div
                className="region-preview"
                role="button"
                tabIndex={0}
                onClick={() => onSelect(region)}
                onKeyDown={e => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    onSelect(region);
                  }
                }}
              >
                <img
                  src={displayImageSrc(region.imageUrl, resolveBackendMediaUrl)}
                  alt={region.name}
                  className="region-image"
                  loading="lazy"
                  referrerPolicy="no-referrer"
                  onError={e => {
                    e.currentTarget.onerror = null;
                    e.currentTarget.src = CARD_PLACEHOLDER_SVG;
                  }}
                />
              </div>
              <div className="region-card-content">
                <span className="region-card-name">{region.name}</span>
                <p className="region-card-summary">
                  {normalizeSummary(region.summary)}
                </p>
                <button
                  type="button"
                  className="region-card-read-more"
                  onClick={() => onSelect(region)}
                >
                  Read More
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </section>
  );
}
