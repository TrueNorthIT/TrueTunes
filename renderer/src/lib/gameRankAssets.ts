import type { GameRankTierKey } from '../hooks/useDailyGame';

import skipButtonSurvivor from '../../../assets/skipbuttonsurvivor-notext.png';
import skipButtonSurvivorText from '../../../assets/Skip Button Survivor.png';
import backgroundBopper from '../../../assets/backgroundbooper-notext.png';
import backgroundBopperText from '../../../assets/BackgroundBopper.png';
import auxCableApprentice from '../../../assets/auxcableapprentice-notext.png';
import auxCableApprenticeText from '../../../assets/Aux Cable Apprentice.png';
import algorithmWhisperer from '../../../assets/AlgorithWhiperer-notext.png';
import algorithmWhispererText from '../../../assets/AlgorithmWhisperer.png';
import playlistProphet from '../../../assets/playlistprophet-notext.png';
import playlistProphetText from '../../../assets/PlaylistProphet.png';

const rankIcons: Partial<Record<GameRankTierKey, string>> = {
  'skip-button-survivor': skipButtonSurvivor,
  'background-bopper': backgroundBopper,
  'aux-cable-apprentice': auxCableApprentice,
  'algorithm-whisperer': algorithmWhisperer,
  'playlist-prophet': playlistProphet,
};

const rankInfoImages: Partial<Record<GameRankTierKey, string>> = {
  'skip-button-survivor': skipButtonSurvivorText,
  'background-bopper': backgroundBopperText,
  'aux-cable-apprentice': auxCableApprenticeText,
  'algorithm-whisperer': algorithmWhispererText,
  'playlist-prophet': playlistProphetText,
};

export function getGameRankIcon(tierKey: GameRankTierKey) {
  return rankIcons[tierKey] ?? null;
}

export function getGameRankInfoImage(tierKey: GameRankTierKey) {
  return rankInfoImages[tierKey] ?? null;
}
