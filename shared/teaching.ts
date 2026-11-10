export type Assignment = {
  id: string;
  schoolId: string;
  title: string;
  instructions: string;
  dueAt: string;
  studentIds: string[];
  archived: boolean;
  createdAt: string;
};
export type Homework = {
  id: string;
  schoolId: string;
  assignmentId: string;
  studentId: string;
  text: string;
  url: string;
  submittedAt: string;
  late: boolean;
  revision: number;
  review: string;
  result: 'SUBMITTED' | 'APPROVED' | 'CHANGES';
};
export type TeachingState = { assignments: Assignment[]; submissions: Homework[] };
export function homeworkLabel(a: Assignment, s?: Homework) {
  if (s)
    return s.result === 'APPROVED'
      ? '확인 완료'
      : s.result === 'CHANGES'
        ? '보완 요청'
        : s.late
          ? '지각 제출'
          : '제출 완료';
  return Date.parse(a.dueAt) < Date.now() ? '미제출 · 마감 지남' : '제출 전';
}
