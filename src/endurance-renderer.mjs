import { GameRenderer } from './game-renderer.mjs';
import './frost-shot-runtime.mjs';

const ENDURANCE_SKIES = [
  { world: 'meadow', atmosphere: { timeOfDay: 'day', intensity: .15 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'late-day', intensity: .35 } },
  { world: 'meadow', atmosphere: { timeOfDay: 'sunset', intensity: .55 } },
];

function skyWithWeather(base, weather) {
  const intensity = weather === 'rain'
    ? .45
    : weather === 'snow'
      ? .35
      : weather === 'frost'
        ? .32
        : base.atmosphere.intensity;
  return {
    ...base,
    backgroundVariant: 'endurance',
    atmosphere: { ...base.atmosphere, weather, intensity },
  };
}

export class EnduranceRenderer extends GameRenderer {
  draw(state, time = 0) {
    this.animationTime = time;
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

    this.drawEnduranceSky(state.enduranceAtmosphere, state.enduranceWeather, time);
    if (state?.level) {
      if (!state.projectile && state.status === 'playing' && !state.paused) {
        if (state.trajectory?.length) this.drawAim(state.trajectory, time);
        else if (state.aimSegment) this.drawShortAim(state.aimSegment, time);
      }

      for (const [key, color] of state.grid) {
        const [c, r] = board.split(key);
        this.drawOrb(color, board.colX(c, r), board.rowY(r), boardScale);
      }

      for (const item of state.falling) {
        ctx.save();
        ctx.translate(item.x, item.y);
        ctx.rotate(item.rot);
        this.drawOrb(item.color, 0, 0, boardScale * .92);
        ctx.restore();
      }

      if (state.mode === 'endurance') this.drawDangerLine(board);

      this.drawOrbRack(state.queue || [], Boolean(state.projectile), boardScale);
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

  drawTimeSky(enduranceAtmosphere = {}, weather = 'clear', time = 0) {
    const stage = Math.max(0, Math.min(ENDURANCE_SKIES.length - 1, Math.floor(Number(enduranceAtmosphere.stage) || 0)));
    const fromStage = Math.max(0, Math.min(stage, Math.floor(Number(enduranceAtmosphere.fromStage) || 0)));
    const progress = Math.max(0, Math.min(1, Number(enduranceAtmosphere.progress) || 0));
    const toSky = skyWithWeather(ENDURANCE_SKIES[stage], weather);
    const fromSky = skyWithWeather(ENDURANCE_SKIES[fromStage], weather);

    if (stage === fromStage || progress >= 1) {
      this.drawSky(toSky, time);
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= 1 - progress;
    this.drawSky(fromSky, time);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha *= progress;
    this.drawSky(toSky, time);
    ctx.restore();
  }

  drawEnduranceSky(enduranceAtmosphere = {}, enduranceWeather = {}, time = 0) {
    const current = enduranceWeather.current || 'clear';
    const previous = enduranceWeather.previous || current;
    const progress = Math.max(0, Math.min(1, Number(enduranceWeather.progress) || 0));

    if (previous === current || progress >= 1) {
      this.drawTimeSky(enduranceAtmosphere, current, time);
      return;
    }

    const ctx = this.ctx;
    ctx.save();
    ctx.globalAlpha *= 1 - progress;
    this.drawTimeSky(enduranceAtmosphere, previous, time);
    ctx.restore();

    ctx.save();
    ctx.globalAlpha *= progress;
    this.drawTimeSky(enduranceAtmosphere, current, time);
    ctx.restore();
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

export { ENDURANCE_SKIES, skyWithWeather };
