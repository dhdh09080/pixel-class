import { Component, type ReactNode } from 'react';
export class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };
  static getDerivedStateFromError() {
    return { failed: true };
  }
  render() {
    return this.state.failed ? (
      <div className="initial-loading" role="alert">
        <h2>잠시 교실을 정리하고 있어요.</h2>
        <p>저장한 데이터는 서버에 그대로 있어요. 다시 연결해 주세요.</p>
        <button className="button primary" onClick={() => location.reload()}>
          교실 다시 열기
        </button>
      </div>
    ) : (
      this.props.children
    );
  }
}
