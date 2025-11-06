import { LunaUnload, reduxStore, Tracer } from "@luna/core";
import { ipcRenderer, PlayState, redux, safeInterval, observePromise, Quality, MediaItem } from "@luna/lib";
import { startServer, stopServer, updateFields } from "./index.native";
import { settings } from "./Settings";
export const { trace } = Tracer("[API]");
export const unloads = new Set<LunaUnload>();
export { Settings } from "./Settings";


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


//const updateMediaFields = async (item: MediaItem) => {
//    const pItems = item;
//    const [album, artist, title, coverUrl, isrc] = await Promise.all([
//        pItems.album(),
//        pItems.artist(),
//        pItems.title(),
//        pItems.coverUrl(),
//        pItems.isrc()
//    ]);
//    const { duration, bestQuality, tidalItem } = pItems;
//    const items = { album: album?.tidalAlbum, artist: artist?.tidalArtist, track: tidalItem, coverUrl, isrc, duration, bestQuality };
//    update(items);
//}

let lastProductId: string | undefined;
let cachedFormatInfo: any = null;

const getFormatInfo = async (mediaItem: MediaItem) => {
    return new Promise((resolve, reject) => {
        if (!mediaItem?.withFormat) {
            return reject(new Error("mediaItem no válido o sin método withFormat"));
        }

        let cleanup: (() => void) | undefined;

        cleanup = mediaItem.withFormat(unloads, PlayState.playbackContext.actualAudioQuality, (info) => {
            cleanup?.(); // desuscribirse una vez obtenido
            resolve({
                sampleRate: info.sampleRate ?? null,
                bitDepth: info.bitDepth ?? null,
                bitrate: info.bitrate ?? null,
            });
        });

        mediaItem.updateFormat().catch(err => {
            cleanup?.();
            reject(err);
        });
    });
};

export const updateMediaFields = async (item: MediaItem) => {
    if (!item) return;

    // --- INFO GENERAL ---
    const [album, artist, title, coverUrl, isrc] = await Promise.all([
        item.album(),
        item.artist(),
        item.title(),
        item.coverUrl(),
        item.isrc()
    ]);

    const { duration, bestQuality, tidalItem } = item;

    // --- INFO DE FORMATO (solo si cambió de track) ---
    let formatInfo = cachedFormatInfo;
    if (item.id !== lastProductId) {
        lastProductId = item.id;
        try {
            formatInfo = await getFormatInfo(item);
            cachedFormatInfo = formatInfo;
            console.log("Formato actualizado:", formatInfo);
        } catch (err) {
            console.error("Error al obtener formato:", err);
        }
    }

    // --- OBJETO FINAL ---
    const items = {
        album: album?.tidalAlbum,
        artist: artist?.tidalArtist,
        track: tidalItem,
        coverUrl,
        isrc,
        duration,
        bestQuality,
        format: formatInfo ?? null,
    };

    update(items);
};


MediaItem.fromPlaybackContext().then((item) => item && updateMediaFields(item));
MediaItem.onMediaTransition(unloads, async (item) =>
    updateMediaFields(item)
);
PlayState.onState(unloads, () =>
    updateStateFields()
);


let doesIPCWork = false;
const interval = setInterval(() => {
    updateStateFields();
    
}, 250);


//const updateStateFields = () => {
//    const { playing  } = PlayState;
//    const items: any = { playing };
//    const { playbackControls } = redux.store.getState();
//    if (playbackControls.volume) items.volume = playbackControls.volume;
//    if (mediaItem.id != PlayState.playbackContext.actualProductId) return;
//	const audioQuality = PlayState.playbackContext.actualAudioQuality;
//
//    updateFields(items);
//}



const updateStateFields = () => {

};


unloads.add(() => {
    clearInterval(interval);
});


ipcRenderer.on(unloads, "api.playback.control", async (data) => {
    updateStateFields();
});


ipcRenderer.on(unloads, "api.mpv.time", (time) => {
    mpvTime = time;
})
