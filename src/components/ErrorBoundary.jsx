import React from 'react'

export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props)
    this.state = { error: null }
  }

  static getDerivedStateFromError(error) {
    return { error }
  }

  componentDidCatch(error, info) {
    // eslint-disable-next-line no-console
    console.error('Render error:', error, info)
  }

  reset = () => this.setState({ error: null })

  render() {
    if (!this.state.error) return this.props.children
    return (
      <div style={{
        position: 'fixed', inset: 0,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        padding: 20, background: 'var(--bg)',
        fontFamily: 'var(--font-mono)', color: 'var(--text)',
      }}>
        <div style={{
          maxWidth: 480,
          border: '1px solid var(--danger)',
          borderRadius: 10,
          padding: 20,
          background: 'var(--bg-soft)',
        }}>
          <div style={{
            color: 'var(--danger)',
            fontSize: 12,
            letterSpacing: '0.1em',
            textTransform: 'uppercase',
            marginBottom: 10,
          }}>
            Render error
          </div>
          <div style={{ fontSize: 13, marginBottom: 12, wordBreak: 'break-word' }}>
            {String(this.state.error?.message || this.state.error)}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <button onClick={this.reset}>Try again</button>
            <button onClick={() => window.location.reload()}>Reload</button>
          </div>
        </div>
      </div>
    )
  }
}
