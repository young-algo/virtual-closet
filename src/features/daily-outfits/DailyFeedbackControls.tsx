import { useState } from 'react';
import type { DailyFeedbackV2, DailyFinalRecommendationV2 } from './types';

interface Props {
  localDate: string;
  recommendation: DailyFinalRecommendationV2;
  feedback?: DailyFeedbackV2;
  onChange: (feedback: DailyFeedbackV2) => void;
}

export default function DailyFeedbackControls({ localDate, recommendation, feedback, onChange }: Props) {
  const [showReasons, setShowReasons] = useState(false);
  const choose = (value: DailyFeedbackV2['value']) => {
    onChange({ localDate, candidateId: recommendation.candidateId, value, createdAt: Date.now() });
    setShowReasons(value === 'disliked');
  };
  return (
    <div className="daily-feedback" aria-label={`Feedback for ${recommendation.name}`}>
      <div className="daily-feedback-actions">
        {([['liked', 'Like'], ['disliked', 'Not for me'], ['wore', 'I wore this']] as const).map(([value, label]) => (
          <button
            key={value}
            type="button"
            className={feedback?.value === value ? 'is-selected' : ''}
            aria-pressed={feedback?.value === value}
            onClick={() => choose(value)}
          >
            {label}
          </button>
        ))}
      </div>
      {showReasons && (
        <label className="daily-reason-field">
          What missed?
          <select
            value={feedback?.reason ?? ''}
            onChange={(event) => onChange({
              localDate,
              candidateId: recommendation.candidateId,
              value: 'disliked',
              reason: event.target.value as DailyFeedbackV2['reason'],
              createdAt: Date.now()
            })}
          >
            <option value="">Choose a reason</option>
            <option value="too-warm">Too warm</option>
            <option value="too-cold">Too cold</option>
            <option value="too-formal">Too formal</option>
            <option value="too-casual">Too casual</option>
            <option value="colors">Colors</option>
            <option value="silhouette">Silhouette</option>
            <option value="shoes">Shoes</option>
            <option value="repeat">Too repetitive</option>
            <option value="other">Other</option>
          </select>
        </label>
      )}
    </div>
  );
}
