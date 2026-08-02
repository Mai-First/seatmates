// Plain async functions so call sites don't change, but the actual UI is a
// themed in-app <Modal> (see components/DialogHost.tsx), not a native dialog.
//
// History: Alert.alert is a silent no-op on react-native-web, so this file
// originally routed web through window.confirm/alert instead. That turned
// out to be its own dead end -- window.confirm silently returns false the
// moment a page is embedded in almost any wrapper (an iframe without
// allow-modals, an in-app preview browser, a WebView), and even a plain
// browser tab auto-suppresses it after a few uses ("prevent this page from
// creating more dialogs"). Neither native primitive is trustworthy on any
// platform, so nothing here should depend on one again.
type ConfirmOptions = { title: string; message: string; confirmLabel: string; destructive: boolean };
type ConfirmHandler = (opts: ConfirmOptions) => Promise<boolean>;
type NotifyHandler = (title: string, message?: string) => void;

let confirmHandler: ConfirmHandler | null = null;
let notifyHandler: NotifyHandler | null = null;

/** Called once by <DialogHost> on mount. Do not call this yourself. */
export function registerDialogHandlers(handlers: { confirm: ConfirmHandler; notify: NotifyHandler }) {
  confirmHandler = handlers.confirm;
  notifyHandler = handlers.notify;
}

export function notify(title: string, message?: string) {
  if (!notifyHandler) {
    console.warn('DialogHost not mounted yet — dropped notify:', title, message);
    return;
  }
  notifyHandler(title, message);
}

export function confirm(
  title: string,
  message: string,
  confirmLabel = 'OK',
  destructive = false,
): Promise<boolean> {
  if (!confirmHandler) {
    console.warn('DialogHost not mounted yet — auto-declining confirm:', title);
    return Promise.resolve(false);
  }
  return confirmHandler({ title, message, confirmLabel, destructive });
}
