import { LunaUnload, reduxStore, Tracer } from "@luna/core";
import { ipcRenderer, MediaItem, PlayState, redux, safeInterval } from "@luna/lib";
import type { MediaItem } from "@luna/lib";
import { startServer, stopServer, updateFields } from "./index.native";
import { settings } from "./Settings";
export const { trace } = Tracer("[API]");
export const unloads = new Set<LunaUnload>();
export { Settings } from "./Settings";
const unloads = new Set<LunaUnload>();

startServer(settings.port || 24123)

unloads.add(() => {
    stopServer();
});

let oldPort = settings.port;
safeInterval(unloads, () => {
    if (settings.port !== oldPort) {
        oldPort = settings.port;
        stopServer().then(() => {
            startServer(settings.port || 24123);
            trace.msg.log("Restarted server on port", settings.port);
        })
    }
}, 5000);


const updateMediaFields = async (item: MediaItem) => {
    const pItems = item;
    const [album, artist, title, coverUrl, isrc] = await Promise.all([
        pItems.album(),
        pItems.artist(),
        pItems.title(),
        pItems.coverUrl(),
        pItems.isrc()
    ]);
    const { duration, bestQuality, tidalItem } = pItems;
    const items = { album: album?.tidalAlbum, artist: artist?.tidalArtist, track: tidalItem, coverUrl, isrc, duration, bestQuality };
    update(items);
}



let doesIPCWork = false;
const interval = setInterval(() => {
    updateStateFields();
}, 250);

const updateStateFields = () => {
    const { playing  } = PlayState;
    const items: any = { playing };
    const { playbackControls } = redux.store.getState();
    if (playbackControls.volume) items.volume = playbackControls.volume;
    const quality = MediaItem.bestQuality;
	MediaItem.withFormat(unloads, quality.audioQuality, ({ sampleRate, bitDepth, bitrate }) => {
		if (!!sampleRate) items.sampleRateContent = `${sampleRate / 1000}kHz`;
		if (!!bitDepth) items.bitDepthContent = `${bitDepth}bit`;
		if (!!bitrate) items.bitrateContent = `${Math.floor(bitrate / 1000).toLocaleString()}kbps`;
	});
    updateFields(items);
}

unloads.add(() => {
    clearInterval(interval);
});


ipcRenderer.on(unloads, "api.playback.control", async (data) => {
    updateStateFields();
});


ipcRenderer.on(unloads, "api.mpv.time", (time) => {
    mpvTime = time;
})
