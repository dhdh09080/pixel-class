import type { Project } from '../shared/types.js';
import { get, put } from './db.js';

export class ProjectConflict extends Error {
  constructor() {
    super(
      '다른 화면에서 프로젝트가 변경됐어요. 최신 내용을 확인한 뒤 다시 저장해 주세요. 입력한 내용은 그대로 남겨 두었어요.',
    );
  }
}

/** All project writes share a monotonic revision; v0.2 JSON starts at zero. */
export function saveProject(project: Project, create = false) {
  const current = get<Project>('project', project.id, project.schoolId);
  if ((!current && !create) || (current && (current.revision || 0) !== (project.revision || 0)))
    throw new ProjectConflict();
  project.revision = (current?.revision || 0) + 1;
  put('project', project, project.schoolId);
  return project;
}
