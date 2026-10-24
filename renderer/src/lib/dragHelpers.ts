export function createDragGhost(label: string, dataTransfer: DataTransfer): void {
  const ghost = document.createElement('div');
  Object.assign(ghost.style, {
    position: 'fixed',
    top: '-100px',
    left: '0',
    background: 'var(--glass)',
    backdropFilter: 'blur(8px)',
    color: 'var(--on-art)',
    padding: '5px 12px',
    borderRadius: 'var(--r-sm)',
    fontSize: 'var(--fs-px)',
    fontWeight: '600',
    pointerEvents: 'none',
    whiteSpace: 'nowrap',
  });
  ghost.textContent = label;
  document.body.appendChild(ghost);
  dataTransfer.setDragImage(ghost, ghost.offsetWidth / 2, 20);
  setTimeout(() => ghost.remove(), 0);
}
