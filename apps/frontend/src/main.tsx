import "@fontsource/ibm-plex-sans-hebrew/300.css";
import "@fontsource/ibm-plex-sans-hebrew/400.css";
import "@fontsource/ibm-plex-sans-hebrew/500.css";
import "@fontsource/ibm-plex-sans-hebrew/600.css";
import "@fontsource/ibm-plex-sans-hebrew/700.css";
import ReactDOM from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { QueryProvider } from "@/components/query-provider";
import { BackgroundUploadRunner, StoreInitializer } from "@/components/store-initializer";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import App from "./App";
import "./globals.css";

// @remotion/media caches decoded video frames in RAM. The editor stays mounted
// for long sessions, so keep this at the library minimum (240 MB) to cap
// background growth when large media files are present.
(window as Window & { remotion_mediaCacheSizeInBytes?: number }).remotion_mediaCacheSizeInBytes =
	240 * 1024 * 1024;

const rootElement = document.getElementById("root");

if (!rootElement) {
	throw new Error("Root element #root was not found.");
}

ReactDOM.createRoot(rootElement).render(
	<BrowserRouter>
		<ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
			<QueryProvider>
				<App />
				<StoreInitializer />
				<BackgroundUploadRunner />
				<Toaster />
			</QueryProvider>
		</ThemeProvider>
	</BrowserRouter>,
);
