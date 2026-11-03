import assert from 'node:assert/strict';
import { test } from 'node:test';
import { sourceLink, completedTracks, mergeDownloads, downloadProgress } from '../src/lib/downloads/model.ts';
const item = { provider: 'youtube', id: 'abcdefghijk', title: 'Faixa de teste', artist: 'Autor', duration: 42, thumbnail: null, url: 'https://www.youtube.com/watch?v=abcdefghijk', downloadable: true };
const job = { id: 'abc', item, format: { id: '140:default:m4a', extension: 'm4a', mime: 'audio/mp4', bitrate: 128 }, state: 'completed', bytes: 100, total: 100, created: 1, uri: 'file:///private/music.m4a', artwork: null, duration: 42, error: null };
test('recognizes supported watch, shared, mobile, shorts and catalog links', () => {
  for(const url of ['https://youtu.be/abcdefghijk?t=2', 'https://www.youtube.com/watch?v=abcdefghijk&list=other', 'https://m.youtube.com/shorts/abcdefghijk']) assert.deepEqual(sourceLink(url), { provider: 'youtube', id: 'abcdefghijk' });
  assert.deepEqual(sourceLink('https://www.jamendo.com/track/1234/title'), { provider: 'jamendo', id: '1234' });
});
test('rejects hostile destinations, credentials, unexpected ports and non-track links', () => {
  for(const url of ['http://youtu.be/abcdefghijk','https://youtube.com.attacker.test/watch?v=abcdefghijk','https://youtube.com@attacker.test/a','https://user:password@youtube.com/watch?v=abcdefghijk','https://youtube.com:444/watch?v=abcdefghijk','file:///tmp/x.mp3','https://127.0.0.1/audio','https://youtube.com/playlist?list=1234','https://youtu.be/invalid','https://jamendo.com/track/../../secret']) assert.throws(() => sourceLink(url), url);
});
test('only finalized, playable downloads enter the music library', () => {
  const tracks = completedTracks([job, {...job,id:'pending',state:'downloading'}, {...job,id:'missing',uri:null}, {...job,id:'empty',duration:0}]);
  assert.equal(tracks.length,1); assert.equal(tracks[0].duration,42); assert.equal(tracks[0].origin.sourceId,item.id); assert.equal(tracks[0].id,'download:abc');
});
test('reconciliation is idempotent and preserves local music and identity', () => {
  const local={id:'document:mine',uri:'content://mine',title:'Minha faixa',artist:'Eu',duration:1};
  const incoming=completedTracks([job]);
  const first=mergeDownloads([local],incoming);
  assert.equal(first[0],local); assert.equal(mergeDownloads(first,incoming).length,2);
  const reload=JSON.parse(JSON.stringify(first));
  assert.deepEqual(mergeDownloads(reload,incoming),first);
});
test('unknown transfer lengths stay indeterminate and progress is clamped', () => {
  assert.equal(downloadProgress({bytes:100,total:0}),null);
  assert.equal(downloadProgress({bytes:100,total:200}),0.5);
  assert.equal(downloadProgress({bytes:300,total:200}),1);
  assert.equal(downloadProgress({bytes:-1,total:200}),0);
});
