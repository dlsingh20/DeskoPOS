/**
 * Which backend the app talks to. This app is DeskoPOS: it always uses the DeskoPOS service
 * (REACT_APP_API_BASE_URL, one login page for every client).
 *
 * The app came from the StayDesko POS; code behind `!IS_DESKOPOS` is that backend's older path
 * and is left only until it is removed.
 */
export const BACKEND = 'deskopos';
export const IS_DESKOPOS = true;
