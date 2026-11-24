import { Howl } from 'howler';

let pickSound: Howl | null = null;

function recording(): Howl {
  pickSound ??= new Howl({
    src: ['/audio/domino-pick.mp3'],
    html5: false,
    preload: true,
    volume: 0.72,
    sprite: { pick: [0, 1000] },
  });
  return pickSound;
}

/** Play the first second of the physical tile recording for a successful pick intent. */
export function playDominoPick(): void {
  recording().play('pick');
}
