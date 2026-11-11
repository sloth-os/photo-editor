import type { Edit } from "./catalog";
import type { Recipe } from "./files";
import type { CameraMetadata } from "./metadata";

export type SavedProject = {
  blob: Blob;
  name: string;
  edits: Edit[];
  pending?: Edit;
  raw: boolean;
  rawSource?: Blob;
  metadata?: CameraMetadata;
  savedAt: number;
};
let dbPromise: Promise<IDBDatabase> | undefined;
function db() {
  if (!dbPromise)
    dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
      const request = indexedDB.open("still-studio", 1);
      request.onupgradeneeded = () =>
        request.result.createObjectStore("studio");
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => {
        dbPromise = undefined;
        reject(request.error);
      };
      request.onblocked = () =>
        reject(new Error("Local storage is blocked by another tab."));
    });
  return dbPromise;
}
async function read<T>(key: string): Promise<T | undefined> {
  const database = await db();
  return new Promise((resolve, reject) => {
    const request = database
      .transaction("studio", "readonly")
      .objectStore("studio")
      .get(key);
    request.onsuccess = () => resolve(request.result as T | undefined);
    request.onerror = () => reject(request.error);
  });
}
async function write(key: string, value: unknown) {
  const database = await db();
  return new Promise<void>((resolve, reject) => {
    const tx = database.transaction("studio", "readwrite");
    tx.objectStore("studio").put(value, key);
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error);
  });
}
export const loadProject = () => read<SavedProject>("project");
export const saveProject = (project: SavedProject) => write("project", project);
export const loadRecipes = async () => (await read<Recipe[]>("recipes")) || [];
export const saveRecipes = (recipes: Recipe[]) => write("recipes", recipes);
export const loadCommunity = <T>(key: string) => read<T>(`community-${key}`);
export const saveCommunity = (key: string, value: unknown) =>
  write(`community-${key}`, value);
