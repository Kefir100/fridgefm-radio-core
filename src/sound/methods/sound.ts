import * as fs from 'fs';
import * as getMP3Duration from 'get-mp3-duration';
import * as _ from 'highland';
import * as id3 from 'node-id3';
import { Readable } from 'stream';
import { extractLast, identity } from '../../utils/funcs';
import { getDateFromMsecs } from '../../utils/time';
import type { ShallowTrackMeta, TrackPath, TrackStats } from '../../types/Track.h';

const getMetaAsync = async (stats: TrackStats): Promise<ShallowTrackMeta> => {
  const { fullPath, name } = stats;

  return new Promise(
    (res) => id3.read(fullPath, (err, meta) => {
      const { artist, title, ...rest } = meta || {};

      if (!artist || !title || err) {
        const calculated = name.split(' - ');
        res({ artist: calculated[0], title: calculated[1], origin: 'fs' });
      }
      res({
        artist, title, ...rest, origin: 'id3',
      });
    }),
  );
};

const getStats = (fullPath: TrackPath) => {
  const [directory, fullName] = extractLast(fullPath, '/');
  const duration = getMP3Duration(fs.readFileSync(fullPath));
  const { size } = fs.statSync(fullPath);
  const [name, format] = extractLast(fullName, '.');

  return {
    bitrate: Math.ceil(size / (duration / 1000)),
    directory,
    duration,
    format,
    fullPath,
    name,
    size,
    stringified: `${name}.${format} [${Math.floor(size / 1024) / 1000}MB/${getDateFromMsecs(duration)}]`,
  };
};

const createSoundStream = ({ fullPath, bitrate, duration }: TrackStats): Readable => {
  const shouldTrim = process.env.NODE_ENV === 'development' && duration > 120000;

  try {
    const rs = _(fs.createReadStream(fullPath, { highWaterMark: bitrate }));
    const comp = _.seq(
      shouldTrim ? _.slice(120, 150) : identity,
      _.ratelimit(1, 1000),
    );

    return comp(rs);
  } catch (e) {
    // skip track if it is not accessible
    return _(new Array(0));
  }
};

export {
  createSoundStream,
  getMetaAsync,
  getStats,
};
