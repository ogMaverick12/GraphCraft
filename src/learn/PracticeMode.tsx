import { useMemo, useState } from 'react'
import { Button } from '../components/ui/Button.tsx'
import { LEARN_TOPICS } from './topics.ts'
import { checkPracticeAnswer, PRACTICE_ITEMS, type PracticeItem } from './practice.ts'
import { loadProgress, saveProgress, type PracticeItemState } from './progress.ts'
import type { LearnTemplate } from './library.ts'
import { LEARN_TEMPLATES } from './templates.ts'

interface PracticeModeProps {
  /** Open a template's rows additively in Graph Studio. */
  onOpenTemplate: (template: LearnTemplate) => void
}

function templateOf(item: PracticeItem): LearnTemplate | null {
  return LEARN_TEMPLATES.find((template) => template.id === item.templateId) ?? null
}

function PracticeCard({ item, state, onAnswered, onRevealed, onOpenTemplate }: {
  item: PracticeItem
  state: PracticeItemState
  onAnswered: (correct: boolean) => void
  onRevealed: () => void
  onOpenTemplate: (template: LearnTemplate) => void
}): React.JSX.Element {
  const [optionIndex, setOptionIndex] = useState<number | null>(null)
  const [numbersText, setNumbersText] = useState('')
  const [feedback, setFeedback] = useState<string | null>(null)
  const [answerShown, setAnswerShown] = useState(false)
  const template = templateOf(item)

  function submitChoice(): void {
    if (optionIndex === null) {
      setFeedback('Choose one of the offered options first.')
      return
    }
    const verdict = checkPracticeAnswer(item, { optionIndex })
    setFeedback(`${verdict.correct ? 'Correct. ' : 'Not quite. '}${verdict.reason}${verdict.correct ? '' : ` ${item.explanation}`}`)
    if (verdict.correct) {
      onAnswered(true)
    }
  }

  function submitNumbers(): void {
    const numbers = numbersText
      .split(',')
      .map((part) => part.trim())
      .filter((part) => part !== '')
      .map(Number)
    const verdict = checkPracticeAnswer(item, { numbers })
    setFeedback(`${verdict.correct ? 'Correct. ' : 'Not quite. '}${verdict.reason}${verdict.correct ? '' : ` ${item.explanation}`}`)
    if (verdict.correct) {
      onAnswered(true)
    }
  }

  function reveal(): void {
    setAnswerShown(true)
    onRevealed()
  }

  const answered = state === 'correct'
  const revealed = state === 'revealed' || answerShown

  return (
    <li className="rounded-md border border-line bg-surface px-3 py-2">
      <p className="text-sm text-ink">{item.prompt}</p>
      <p className="mt-1 text-xs text-muted">
        {item.kind === 'explore' ? 'Guided exploration — no checked answer.' : `Level: ${item.levels.join(', ')}`}
        {answered && <span className="ml-2 font-semibold text-ink">✓ Answered</span>}
        {state === 'revealed' && !answered && <span className="ml-2 text-muted">(answer revealed earlier)</span>}
      </p>

      {(item.kind === 'predict-transform' || item.kind === 'match-graph') && (
        <div role="radiogroup" aria-label={`Options for ${item.id}`} className="mt-2 flex flex-col gap-1">
          {(item.options ?? []).map((option, i) => (
            <label key={i} className="flex cursor-pointer items-center gap-2 text-sm text-ink">
              <input
                type="radio"
                name={`practice-${item.id}`}
                checked={optionIndex === i}
                onChange={() => {
                  setOptionIndex(i)
                  setFeedback(null)
                }}
                className="h-4 w-4 accent-accent"
              />
              <span className="font-mono">{option}</span>
            </label>
          ))}
          <div>
            <Button onClick={submitChoice} title="Check the selected option" className="mt-1 px-2 py-0.5 text-xs" variant="ghost">
              Check answer
            </Button>
          </div>
        </div>
      )}

      {item.kind === 'identify-feature' && (
        <div className="mt-2 flex flex-wrap items-center gap-2">
          <label className="block text-xs text-muted">
            <span className="font-semibold uppercase tracking-wide">Your numbers (comma-separated)</span>
            <input
              type="text"
              inputMode="decimal"
              aria-label={`Numbers for ${item.id}`}
              value={numbersText}
              onChange={(event) => {
                setNumbersText(event.target.value)
                setFeedback(null)
              }}
              placeholder="e.g. -2, 2"
              className="mt-0.5 w-48 rounded-md border border-line bg-bg px-2 py-1 font-mono text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            />
          </label>
          <Button onClick={submitNumbers} title="Check the entered numbers" className="mt-1 self-end px-2 py-0.5 text-xs" variant="ghost">
            Check answer
          </Button>
        </div>
      )}

      {feedback !== null && (
        <p role="status" aria-label="Practice feedback" aria-live="polite" className="mt-2 text-xs text-ink">
          {feedback}
        </p>
      )}

      <div className="mt-2 flex flex-wrap gap-1">
        {!revealed && (
          <Button onClick={reveal} title="Reveal the verified solution" variant="ghost" className="px-2 py-0.5 text-xs">
            {item.kind === 'explore' ? 'Show guidance' : 'Show answer'}
          </Button>
        )}
        {revealed && (
          <p className="text-xs text-muted">
            <span className="font-semibold text-ink">Answer: </span>
            <span className="font-mono">{item.solution}</span> — {item.explanation}
          </p>
        )}
        {template !== null && (
          <Button onClick={() => onOpenTemplate(template)} title={`Open ${template.title} as editable copies in Graph Studio`} aria-label={`Show graph for ${item.id}`} variant="ghost" className="px-2 py-0.5 text-xs">
            Show graph
          </Button>
        )}
      </div>
    </li>
  )
}

/**
 * Practice mode (Stage 5 S5.4): curated prompts with decidable
 * checking. Feedback comes only from `checkPracticeAnswer` — never
 * from a heuristic — and exploration items carry no correctness
 * indicator at all. Progress (last topic, answered/revealed marks)
 * persists locally; storage refusal runs stateless. No accounts, no
 * scores, no analytics.
 */
export function PracticeMode({ onOpenTemplate }: PracticeModeProps): React.JSX.Element {
  const [stored, setStored] = useState(() => loadProgress())
  const [topicId, setTopicId] = useState<string>(() => stored.lastTopicId ?? LEARN_TOPICS[0]?.id ?? '')
  const [notice, setNotice] = useState<string | null>(null)

  const items = useMemo(() => PRACTICE_ITEMS.filter((item) => item.topicId === topicId), [topicId])
  const topic = LEARN_TOPICS.find((entry) => entry.id === topicId)

  function persist(next: { lastTopicId: string | null; items: Record<string, PracticeItemState> }): void {
    setStored(next)
    if (!saveProgress(next)) {
      setNotice((current) => current ?? 'Progress could not be saved in this browser; practice still works for this visit.')
    }
  }

  function selectTopic(id: string): void {
    setTopicId(id)
    persist({ lastTopicId: id, items: stored.items })
  }

  function markItem(id: string, state: PracticeItemState): void {
    persist({ lastTopicId: stored.lastTopicId, items: { ...stored.items, [id]: state } })
  }

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4">
      <div className="rounded-lg border border-line bg-surface p-4 shadow-panel">
        <h2 className="text-sm font-semibold text-ink">Practice — check yourself against worked solutions</h2>
        <p className="mt-1 text-xs text-muted">Curated prompts only. Checked answers come from exact comparisons; exploration has no score.</p>
        <label className="mt-3 block text-xs text-muted">
          <span className="font-semibold uppercase tracking-wide">Topic</span>
          <select
            aria-label="Practice topic"
            value={topicId}
            onChange={(event) => selectTopic(event.target.value)}
            className="mt-0.5 w-full rounded-md border border-line bg-bg px-2 py-1 text-sm text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          >
            {LEARN_TOPICS.map((entry) => (
              <option key={entry.id} value={entry.id}>
                {entry.title}
              </option>
            ))}
          </select>
        </label>
        {notice !== null && (
          <p role="alert" className="mt-2 text-xs text-danger">
            {notice}
          </p>
        )}
      </div>

      {topic !== undefined && (
        <p className="text-xs text-muted" data-testid="practice-count">
          {items.length} prompt{items.length === 1 ? '' : 's'} in {topic.title}.
        </p>
      )}

      <ul className="flex flex-col gap-2">
        {items.map((item) => (
          <PracticeCard
            key={item.id}
            item={item}
            state={stored.items[item.id] ?? 'unseen'}
            onAnswered={() => markItem(item.id, 'correct')}
            onRevealed={() => markItem(item.id, 'revealed')}
            onOpenTemplate={onOpenTemplate}
          />
        ))}
      </ul>
      {items.length === 0 && <p className="text-sm text-muted">No prompts for this topic yet.</p>}
    </div>
  )
}
