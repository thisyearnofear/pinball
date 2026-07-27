/**
 * The MIT License (MIT)
 *
 * Igor Zinken 2023 - https://www.igorski.nl
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy of
 * this software and associated documentation files (the "Software"), to deal in
 * the Software without restriction, including without limitation the rights to
 * use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of
 * the Software, and to permit persons to whom the Software is furnished to do so,
 * subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in all
 * copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS
 * FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR
 * COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER
 * IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN
 * CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
 */
import { Sprite } from "zcanvas";
import type { Point, Viewport, IRenderer } from "zcanvas";
import type Actor from "@/model/actor";
import type Bumper from "@/model/bumper";

// Kamikaze Ball visual mode — set by game.ts when Kamikaze mode is active.
// Avoids circular dependency: renderer reads this flag, game.ts sets it.
let kamikazeMode = false;
export function setKamikazeMode(enabled: boolean): void {
    kamikazeMode = enabled;
}

// Ghost Ball active (player power-up): bumpers render faded, ball phases through.
let ghostMode = false;
export function setGhostMode(enabled: boolean): void {
    ghostMode = enabled;
}

// Bumper Frenzy active (machine power-up): bumpers pulse fast and bright.
let frenzyMode = false;
export function setFrenzyMode(enabled: boolean): void {
    frenzyMode = enabled;
}

export default class BumperRenderer extends Sprite {
    protected collisionAnimation = false;
    protected collisionIterations = 0;
    protected collisionOffset: Point;
    protected collisionRadius: number;
    protected collisionStroke = { color: "#00AEEF", size: 2 };

    constructor( private actor: Actor ) {
        super({ width: actor.bounds.width, height: actor.bounds.width });

        this.collisionRadius = this.actor.radius * 1.1;
        this.collisionOffset = {
            x: this.actor.bounds.left - (( this.collisionRadius - this.actor.radius ) / 2 ),
            y: this.actor.bounds.top  - (( this.collisionRadius - this.actor.radius ) / 2 )
        };
    }

    override draw( renderer: IRenderer, viewport: Viewport ): void {
        if ( !this.isVisible( viewport )) {
            return; // out of visual bounds
        }
        let { left, top } = this._bounds;

        const { collided } = this.actor as Bumper;
        let { radius } = this.actor;

        if ( !collided ) {
            radius = this.collisionRadius;
            left = this.collisionOffset.x;
            top = this.collisionOffset.y;
        }

        // Kamikaze Ball: bumpers are red/hostile (enemies that keep ball alive)
        // Normal mode: bumpers are blue/inviting (hit them for points)
        const strokeAlpha = ghostMode ? 0.25 : 1;
        const fillColor = kamikazeMode
            ? (collided ? "#ff3333" : "transparent")
            : (collided ? "#00AEEF" : "transparent");
        const strokeColor = kamikazeMode
            ? (ghostMode ? `rgba(255, 68, 68, ${strokeAlpha})` : "#ff4444")
            : "#00AEEF";
        const stroke = !collided ? { color: strokeColor, size: 2 } : undefined;

        renderer.drawCircle(
            left - viewport.left, top - viewport.top,
            radius,
            fillColor,
            stroke,
        );

        // Kamikaze Ball: pulsing red glow ring around bumpers
        // (faster + brighter during Bumper Frenzy, suppressed while Ghost Ball phases through)
        if (kamikazeMode && !collided && !ghostMode) {
            const pulseSpeed = frenzyMode ? 100 : 300;
            const pulse = 0.5 + 0.5 * Math.sin(Date.now() / pulseSpeed);
            const baseAlpha = frenzyMode ? 0.5 : 0.3;
            renderer.drawCircle(
                left - viewport.left, top - viewport.top,
                radius + 4 + pulse * (frenzyMode ? 6 : 3),
                "transparent",
                { color: `rgba(255, 50, 50, ${baseAlpha + pulse * 0.3})`, size: frenzyMode ? 2 : 1 },
            );
        }

        if ( collided ) {
            if ( !this.collisionAnimation ) {
                this.collisionAnimation = true;
                this.collisionIterations = 15;
            } else if ( --this.collisionIterations === 0 ) {
                this.collisionAnimation = false;
                ( this.actor as Bumper ).collided = false;
            }
        }
    }
};
