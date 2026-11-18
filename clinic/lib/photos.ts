import type { StaticImageData } from "next/image";
import vialsSyringeLight from "@/photos/vials-syringe-light.jpg";
import ivBag from "@/photos/iv-bag.jpg";
import ivDripChamber from "@/photos/iv-drip-chamber.jpg";
import vialsViolet from "@/photos/vials-violet.jpg";
import softgelsBottle from "@/photos/softgels-bottle.jpg";
import softgelsClose from "@/photos/softgels-close.jpg";
import infinityPool from "@/photos/infinity-pool.jpg";
import junglePool from "@/photos/jungle-pool.jpg";
import waterLemonSun from "@/photos/water-lemon-sun.jpg";
import bedPoolView from "@/photos/bed-pool-view.jpg";
import balconyMorning from "@/photos/balcony-morning.jpg";
import orangeSlices from "@/photos/orange-slices.jpg";
import surferSunset from "@/photos/surfer-sunset.jpg";
import oilBottleFlowers from "@/photos/oil-bottle-flowers.jpg";
import syringeRed from "@/photos/syringe-red.jpg";
import syringeHand from "@/photos/syringe-hand.jpg";
import vialsSyringeLilac from "@/photos/vials-syringe-lilac.jpg";
import vialMoss from "@/photos/vial-moss.jpg";
import oilBottleShadow from "@/photos/oil-bottle-shadow.jpg";
import vialInHand from "@/photos/vial-in-hand.jpg";
import vialsRow from "@/photos/vials-row.jpg";
import vialsCyan from "@/photos/vials-cyan.jpg";
import stethoscopeTablet from "@/photos/stethoscope-tablet.jpg";
import waterCitrusGlass from "@/photos/water-citrus-glass.jpg";
import capsulesGreen from "@/photos/capsules-green.jpg";
import powderTub from "@/photos/powder-tub.jpg";
import powderScoop from "@/photos/powder-scoop.jpg";
import meditationSilhouette from "@/photos/meditation-silhouette.jpg";
import athleteBack from "@/photos/athlete-back.jpg";
import villaTerracePool from "@/photos/villa-terrace-pool.jpg";
import villaPoolsidePalms from "@/photos/villa-poolside-palms.jpg";
import doctorCoat from "@/photos/doctor-coat.jpg";
import nurseScrubs from "@/photos/nurse-scrubs.jpg";
import riceTerraces from "@/photos/rice-terraces.jpg";
import riceFieldPalms from "@/photos/rice-field-palms.jpg";
import vialsTray from "@/photos/vials-tray.jpg";
import villaAerial from "@/photos/villa-aerial.jpg";
import villaLivingRoom from "@/photos/villa-living-room.jpg";

/**
 * Every photograph on the site, by name. The files live in /photos (sources and licence in photos/CREDITS.md).
 * They are illustrative stock images: to use your own, replace a file under the same name, or add a file and a line here.
 * Importing them here lets Next.js size them, serve modern formats and show a blurred preview while they load.
 */
export const PHOTOS = {
  "vials-syringe-light": vialsSyringeLight,
  "iv-bag": ivBag,
  "iv-drip-chamber": ivDripChamber,
  "vials-violet": vialsViolet,
  "softgels-bottle": softgelsBottle,
  "softgels-close": softgelsClose,
  "infinity-pool": infinityPool,
  "jungle-pool": junglePool,
  "water-lemon-sun": waterLemonSun,
  "bed-pool-view": bedPoolView,
  "balcony-morning": balconyMorning,
  "orange-slices": orangeSlices,
  "surfer-sunset": surferSunset,
  "oil-bottle-flowers": oilBottleFlowers,
  "syringe-red": syringeRed,
  "syringe-hand": syringeHand,
  "vials-syringe-lilac": vialsSyringeLilac,
  "vial-moss": vialMoss,
  "oil-bottle-shadow": oilBottleShadow,
  "vial-in-hand": vialInHand,
  "vials-row": vialsRow,
  "vials-cyan": vialsCyan,
  "stethoscope-tablet": stethoscopeTablet,
  "water-citrus-glass": waterCitrusGlass,
  "capsules-green": capsulesGreen,
  "powder-tub": powderTub,
  "powder-scoop": powderScoop,
  "meditation-silhouette": meditationSilhouette,
  "athlete-back": athleteBack,
  "villa-terrace-pool": villaTerracePool,
  "villa-poolside-palms": villaPoolsidePalms,
  "doctor-coat": doctorCoat,
  "nurse-scrubs": nurseScrubs,
  "rice-terraces": riceTerraces,
  "rice-field-palms": riceFieldPalms,
  "vials-tray": vialsTray,
  "villa-aerial": villaAerial,
  "villa-living-room": villaLivingRoom,
} satisfies Record<string, StaticImageData>;

export type PhotoKey = keyof typeof PHOTOS;

/** Where the subject sits (CSS object-position), for photos whose subject is off-centre when the frame crops them. */
export const FOCUS: Partial<Record<PhotoKey, string>> = {
  "iv-bag": "50% 38%",
  "iv-drip-chamber": "50% 22%",
  "vials-row": "50% 72%",
  "vials-cyan": "50% 60%",
  "vial-in-hand": "78% 45%",
  "syringe-hand": "50% 45%",
  "syringe-red": "62% 50%",
  "surfer-sunset": "50% 68%",
  "stethoscope-tablet": "50% 45%",
  "water-citrus-glass": "50% 58%",
  "oil-bottle-flowers": "50% 50%",
  "oil-bottle-shadow": "50% 45%",
  "powder-tub": "50% 60%",
  "jungle-pool": "50% 40%",
  "infinity-pool": "50% 70%",
  "villa-aerial": "50% 45%",
  "villa-poolside-palms": "50% 55%",
  "doctor-coat": "60% 50%",
};
