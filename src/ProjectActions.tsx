import { BookOpen, MessageCircle, Sparkles, ArrowRight, CheckCircle2 } from 'lucide-react';
import type { Project } from '../shared/types';
import { Badge, Button, Surface, InlineNotice } from './ui';

export function ProjectActions({
  project: p,
  master,
  aiConfigured,
  onTab,
}: {
  project: Project;
  master: boolean;
  aiConfigured: boolean;
  onTab: (tab: string) => void;
}) {
  const next =
    p.roadmap?.find((step) => !step.done)?.text || p.tasks.find((task) => !task.done)?.text;
  const blocked = p.updates.at(-1)?.work?.blockers;
  const waiting = p.questions.filter((q) =>
    ['NEW', 'ACKNOWLEDGED'].includes(q.status || 'NEW'),
  ).length;
  return (
    <Surface className="project-next-step">
      <div className="between">
        <p className="eyebrow">{master ? 'MENTOR WORKSPACE' : 'YOUR NEXT SMALL STEP'}</p>
        <Badge
          tone={
            p.status === 'REVIEW' ? 'warning' : p.status === 'COMPLETED' ? 'success' : 'neutral'
          }
        >
          {p.status === 'REVIEW'
            ? '검토를 기다리고 있어요'
            : p.status === 'COMPLETED'
              ? '완성한 프로젝트'
              : '다음 한 걸음'}
        </Badge>
      </div>
      <h3>
        {p.status === 'COMPLETED'
          ? '완성까지의 배움을 남겨 볼까요?'
          : next || '가장 작은 첫 기능부터 정해 볼까요?'}
      </h3>
      <p className="muted">
        {master
          ? '질문에 답하고, 다음 과제를 짧고 구체적으로 남겨 주세요.'
          : '완벽한 계획보다 작은 실행이 먼저예요. 오늘 한 일과 막힌 부분을 남겨 주세요.'}
      </p>
      <div className="next-step-actions">
        {master ? (
          <>
            <Button variant="primary" onClick={() => onTab('feedback')}>
              <MessageCircle size={16} />
              피드백·다음 과제 작성
            </Button>
            <Button onClick={() => onTab('questions')}>
              학생 질문 {waiting ? `${waiting}개` : ''}
              <ArrowRight size={15} />
            </Button>
            {p.status === 'REVIEW' && (
              <Button onClick={() => onTab('submissions')}>
                <CheckCircle2 size={16} />
                제출 검토
              </Button>
            )}
          </>
        ) : (
          <>
            <Button variant="primary" onClick={() => onTab('updates')}>
              <BookOpen size={16} />
              오늘 기록 남기기
            </Button>
            <Button onClick={() => onTab('questions')}>
              <MessageCircle size={16} />
              선생님께 질문
            </Button>
            <Button variant="ghost" onClick={() => onTab('ai')}>
              <Sparkles size={16} />
              {aiConfigured ? 'AI에게 도움받기' : 'AI 연결 안내'}
            </Button>
          </>
        )}
      </div>
      {blocked && (
        <InlineNotice title="현재 막힌 부분">
          <p>{blocked}</p>
        </InlineNotice>
      )}
    </Surface>
  );
}
