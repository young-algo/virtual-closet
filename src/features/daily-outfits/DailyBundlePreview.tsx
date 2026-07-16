import type { DailyBundleV2, DailyFeedbackV2, DailySourceItem } from './types';
import DailyFeedbackControls from './DailyFeedbackControls';
import { parseCachedDailyBundleV2 } from './dailyBundleParser';
import { productImageBlendMode } from '../../utils/productImagePresentation';

const ARCHETYPE_LABELS = { easy: 'Easy', 'polished-casual': 'Polished casual', expressive: 'Expressive' } as const;

interface Props {
  bundle: DailyBundleV2;
  items: DailySourceItem[];
  feedback: DailyFeedbackV2[];
  onFeedback: (feedback: DailyFeedbackV2) => void;
}

export default function DailyBundlePreview({ bundle: bundleValue, items, feedback, onFeedback }: Props) {
  const bundle = parseCachedDailyBundleV2(bundleValue);
  const generatedCountCopy = bundle.recommendations.length === 1
    ? "Today's outfit"
    : `Today's ${bundle.recommendations.length} outfits`;
  const omittedLabels = bundle.coverage.omittedArchetypes
    .map(archetype => ARCHETYPE_LABELS[archetype]);
  const coverageNote = bundle.coverage.deliveryMode === 'partial' && omittedLabels.length
    ? `${omittedLabels.join(' and ')} ${omittedLabels.length === 1 ? 'was' : 'were'} omitted after today's quality, weather, and outfit-distinctness checks.`
    : '';
  const byId = new Map(items.map(item => [item.id, item]));
  const encoreItems = Array.isArray(bundle.encore?.itemIds)
    ? bundle.encore.itemIds.map(id => byId.get(id)).filter((item): item is DailySourceItem => Boolean(item))
    : [];
  const encoreFeedback = bundle.encore
    ? feedback.find(entry => entry.localDate === bundle.localDate && entry.candidateId === bundle.encore?.candidateId)
    : undefined;
  return (
    <section className="daily-preview" aria-labelledby="daily-preview-heading">
      <div className="daily-preview-heading">
        <div>
          <span className="daily-kicker">Latest bundle</span>
          <h3 id="daily-preview-heading">{new Date(`${bundle.localDate}T12:00:00`).toLocaleDateString('en-US', { weekday: 'long', month: 'long', day: 'numeric' })}</h3>
        </div>
        <p>{Math.round(bundle.weather.morningFeelsLikeF)}° morning · {Math.round(bundle.weather.highTemperatureF)}° high · {Math.round(bundle.weather.maxRainProbability)}% rain</p>
      </div>
      <p className="daily-weather-copy">{bundle.weather.plainEnglishSummary}</p>
      <h4 className="daily-generated-count">{generatedCountCopy}</h4>
      {coverageNote && <p className="daily-coverage-note">{coverageNote}</p>}
      <div className={`daily-looks is-${bundle.recommendations.length}`}>
        {bundle.recommendations.map((recommendation, index) => {
          const recommendationItems = recommendation.itemIds.map(id => byId.get(id)).filter((item): item is DailySourceItem => Boolean(item));
          const selectedFeedback = feedback.find(entry => entry.localDate === bundle.localDate && entry.candidateId === recommendation.candidateId);
          return (
            <article key={recommendation.candidateId} className="daily-look">
              <div className="daily-look-label">0{index + 1} {ARCHETYPE_LABELS[recommendation.archetype]}</div>
              <h4>{recommendation.name}</h4>
              <div className="daily-look-images">
                {recommendationItems.map(item => (
                  <img
                    key={item.id}
                    src={item.image}
                    alt={item.name}
                    style={{ mixBlendMode: productImageBlendMode(item.category) }}
                  />
                ))}
              </div>
              {recommendation.colorHook && <p className="daily-color-hook"><strong>Color hook</strong> — {recommendation.colorHook}</p>}
              <p>{recommendation.whyItWorks}</p>
              <p className="daily-weather-note">Weather — {recommendation.weatherNote}</p>
              <ul>
                {recommendationItems.map(item => <li key={item.id}>{item.name}</li>)}
              </ul>
              <DailyFeedbackControls localDate={bundle.localDate} recommendation={recommendation} feedback={selectedFeedback} onChange={onFeedback} />
            </article>
          );
        })}
      </div>
      {bundle.encore && (
        <article className="daily-encore">
          <div className="daily-look-label">Encore — from your saved outfits</div>
          <h4>{bundle.encore.name}</h4>
          <div className="daily-look-images">
            {encoreItems.map((item, index) => (
              <img
                key={`${item.id}:${index}`}
                src={item.image}
                alt={item.name}
                style={{ mixBlendMode: productImageBlendMode(item.category) }}
              />
            ))}
          </div>
          <p>One of yours, back in rotation for today's weather.</p>
          <ul>
            {encoreItems.map((item, index) => <li key={`${item.id}:${index}`}>{item.name}</li>)}
          </ul>
          <DailyFeedbackControls
            localDate={bundle.localDate}
            recommendation={bundle.encore}
            feedback={encoreFeedback}
            onChange={onFeedback}
          />
        </article>
      )}
    </section>
  );
}
