import { LunaUnload, reduxStore, Tracer } from "@luna/core";
import { ipcRenderer, PlayState, redux, safeInterval, observePromise, Quality, type MediaItem } from "@luna/lib";
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


let formatUnload: LunaUnload | undefined;
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
const getFormatInfo = async (mediaItem: MediaItem) => {
    return new Promise((resolve, reject) => {
        let cleanup: (() => void) | undefined;

        // Nos suscribimos a la información del formato
        cleanup = mediaItem.withFormat(unloads, PlayState.playbackContext.actualAudioQuality, (info) => {
            cleanup?.(); // nos desuscribimos una vez recibida la info
            resolve({
                sampleRate: info.sampleRate ?? null,
                bitDepth: info.bitDepth ?? null,
                bitrate: info.bitrate ?? null,
            });
        });

        // Forzamos actualización de formato
        mediaItem.updateFormat().catch(err => {
            cleanup?.();
            reject(err);
        });
    });
};

let lastProductId: string | undefined = undefined;
let cachedFormatInfo: any = null;

const updateStateFields = () => {
    const { playing } = PlayState;
    const items: any = { playing };

    const { playbackControls } = redux.store.getState();
    if (playbackControls.volume) items.volume = playbackControls.volume;

    const mediaItem = PlayState.playbackContext?.mediaItem;
    if (!mediaItem) return;

    if (mediaItem.id !== PlayState.playbackContext.actualProductId) return;

    // Si cambió de canción o track, actualizamos el formato UNA VEZ
    if (mediaItem.id !== lastProductId) {
        lastProductId = mediaItem.id;

        getFormatInfo(mediaItem)
            .then(info => {
                cachedFormatInfo = info;
                console.log("Nuevo formato detectado:", info);
            })
            .catch(err => {
                console.error("Error al obtener formato:", err);
            });
    }
    // Reutilizamos el último formato conocido
    if (cachedFormatInfo) {
        items.format = cachedFormatInfo;
    }

    updateFields(items);
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
