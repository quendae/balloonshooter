import { GameRenderer } from './game-renderer.mjs';

export class EnduranceRenderer extends GameRenderer {
  draw(state, time = 0) {
    const board = state.geometry || this.B;
    const originalBoard = this.B;
    this.B = board;
    const boardScale = board.RAD / 12;
    const ctx = this.ctx;

    ctx.clearRect(0, 0, board.LW, board.LH);
    ctx.fillStyle = '#17324a';
    ctx.fillRect(0, 0, board.LW, board.LH);

    const shake = Number(state?.shake) || 0;
    const shakeX = shake ? Math.sin(time * .071) * shake * .75 : 0;
    const shakeY = shake ? Math.cos(time * .093) * shake * .45 : 0;
    ctx.save();
    ctx.translate(shakeX, shakeY);

    this.drawSky(state?.level, time);
    if (state?.level) {
      if (!state.projectile && state.status === 'playing' && !state.paused) {
        if (state.trajectory?.length) this.drawAim(state.trajectory, time);
        else if (state.aimSegment) this.drawShortAim(state.aimSegment, time);
      }

      if (Array.isArray(state.transitionCells) && state.transitionCells.length) {
        for (const cell of state.transitionCells) {
          const scale = Math.max(.1, Number(cell.radius) || board.RAD) / 12;
          this.drawOrb(cell.color, cell.x, cell.y, scale);
        }
      } else {
        for (const [key, color] of state.grid) {
          const [c, r] = board.split(key);
          this.drawOrb(color, board.colX(c, r), board.rowY(r), boardScale);
        }
      }

      for (const item of state.falling) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rot);
        this.drawOrb(item.color, 0, 0, boardScale * .92);
        ctx.restore();
      }

      if (state.mode === 'endurance') this.drawDangerLine(board);

      this.drawOrbRack(state.queue || [], Boolean(state.projectile));
      if (state.projectile) {
        this.drawProjectileTrail(state.projectile);
        this.drawShot(state.projectile, state.projectile.x, state.projectile.y, boardScale);
      }

      this.drawParticles(state.particles || []);
    }
    ctx.restore();

    if (state?.flash > 0) {
      ctx.save();
      ctx.fillStyle = `rgba(238,248,255,${Math.min(.34, state.flash)})`;
      ctx.fillRect(0, 0, board.LW, board.LH);
      ctx.restore();
    }

    if (state?.paused) {
      ctx.fillStyle = 'rgba(9, 22, 34, .48)';
      ctx.fillRect(0, 0, board.LW, board.LH);
    }

    this.B = originalBoard;
  }

  drawDangerLine(board) {
    const ctx = this.ctx;
    const y = board.LAUNCH_Y - 17;
    ctx.save();
    ctx.strokeStyle = 'rgba(255,238,188,.42)';
    ctx.lineWidth = .8;
    ctx.setLineDash([4, 4]);
    ctx.beginPath();
    ctx.moveTo(6, y);
    ctx.lineTo(board.LW - 6, y);
    ctx.stroke();
    ctx.setLineDash([]);
    ctx.restore();
  }
}
