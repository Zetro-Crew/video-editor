import type StateManager from "@designcombo/state";
import { ChevronDown, CircleCheckIcon, Info } from "lucide-react";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { fetchCore } from "@/utils/fetch-core";
import { clearProject } from "./external-preview/payload-intake";
import { useDownloadState } from "./store/use-download-state";
import { validateMediaName } from "./utils/validate-media-name";

type Channel = { _id: string; name: string };

const DownloadProgressModal = ({ stateManager }: { stateManager: StateManager }) => {
	const { displayProgressModal, exporting, submitted, retryCount, error, actions, exportType } =
		useDownloadState();
	const navigate = useNavigate();

	const [analysisProgress, setAnalysisProgress] = useState(0);

	// Form phase state
	const [mediaName, setMediaName] = useState("");
	const [nameError, setNameError] = useState<string | null>(null);
	const [downloadToComputer, setDownloadToComputer] = useState(false);
	const [copyWatchLink, setCopyWatchLink] = useState(false);
	const [saveToPersonalChannel, setSaveToPersonalChannel] = useState(false);
	const [saveToUnitChannel, setSaveToUnitChannel] = useState(false);
	const [selectedChannelIds, setSelectedChannelIds] = useState<string[]>([]);
	const [channelSearchQuery, setChannelSearchQuery] = useState("");
	const [channels, setChannels] = useState<Channel[]>([]);
	const [channelsLoading, setChannelsLoading] = useState(false);
	const [displayName, setDisplayName] = useState<string | null>(null);

	const isFormPhase = !exporting && !submitted && !error;
	const isAnalyzingPhase = exporting;
	const isSubmittedPhase = submitted;
	const isErrorPhase = !!error && !exporting && !submitted;

	// Animate 0→90% while POST is in-flight, snap to 100 on submitted
	useEffect(() => {
		if (!exporting) return;
		setAnalysisProgress(0);
		const id = setInterval(() => {
			setAnalysisProgress((prev) => (prev < 90 ? prev + 2 : prev));
		}, 200);
		return () => clearInterval(id);
	}, [exporting]);

	useEffect(() => {
		if (submitted) setAnalysisProgress(100);
	}, [submitted]);

	useEffect(() => {
		if (!displayProgressModal) return;
		fetchCore("/users/me")
			.then((r) => r.json())
			.then((data: { displayName?: string }) => setDisplayName(data.displayName ?? null))
			.catch(() => {});
		setChannelsLoading(true);
		fetchCore("/media/clip/managed-virtual-channels")
			.then((r) => r.json())
			.then((data: Channel[]) => setChannels(data))
			.catch(() => setChannels([]))
			.finally(() => setChannelsLoading(false));
	}, [displayProgressModal]);

	const handleNameChange = (value: string) => {
		setMediaName(value);
		setNameError(validateMediaName(value));
	};

	const isNameValid = mediaName.trim().length > 0 && nameError === null;

	const filteredChannels = channels.filter((c) =>
		c.name.toLowerCase().includes(channelSearchQuery.toLowerCase()),
	);

	const toggleChannel = (id: string) => {
		setSelectedChannelIds((prev) =>
			prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id],
		);
	};

	const handleExport = () => {
		if (!isNameValid) return;
		const mediaId = crypto.randomUUID();
		actions.setSaveMetadata({
			mediaName: mediaName.trim(),
			mediaId,
			downloadToComputer,
			saveToPersonalChannel,
			selectedChannelIds: saveToUnitChannel ? selectedChannelIds : [],
		});
		void actions.startExport({ copyWatchLink });
	};

	const handleRetry = () => {
		actions.incrementRetryCount();
		void actions.startExport({ copyWatchLink });
	};

	const handleReturnHome = () => {
		clearProject(stateManager);
		actions.setDisplayProgressModal(false);
		navigate("/");
	};

	const channelsDisabled = !channelsLoading && channels.length === 0;

	return (
		<Dialog open={displayProgressModal} onOpenChange={actions.setDisplayProgressModal}>
			<DialogContent
				showCloseButton={false}
				className="flex h-[627px] flex-col gap-0 bg-background p-0 sm:max-w-[844px] overscroll-contain"
			>
				<DialogTitle className="flex h-16 items-center border-b px-4 font-medium text-base">
					שמירה
				</DialogTitle>
				<DialogDescription className="sr-only">תיבת דו-שיח להתקדמות השמירה</DialogDescription>

				{isFormPhase ? (
					<div className="flex flex-1 flex-col items-center justify-start gap-0 overflow-y-auto">
						<div className="w-full max-w-sm space-y-4 py-6">
							<div className="space-y-1">
								<Label htmlFor="media-name">שם המדיה</Label>
								<Input
									id="media-name"
									value={mediaName}
									onChange={(e) => handleNameChange(e.target.value)}
									placeholder="הזן שם לקובץ"
									dir="rtl"
									maxLength={75}
								/>
								{nameError && (
									<p className="text-destructive text-xs" role="alert">
										{nameError}
									</p>
								)}
							</div>

							<div className="space-y-2">
								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										id="download-to-computer"
										checked={downloadToComputer}
										onChange={(e) => setDownloadToComputer(e.target.checked)}
										className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
									/>
									<Label htmlFor="download-to-computer" className="cursor-pointer font-normal">
										הורד למחשב
									</Label>
								</div>

								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										id="copy-watch-link"
										checked={copyWatchLink}
										onChange={(e) => setCopyWatchLink(e.target.checked)}
										className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
									/>
									<Label htmlFor="copy-watch-link" className="cursor-pointer font-normal">
										העתקת קישור צפייה
									</Label>
								</div>

								<div className="flex items-center gap-2">
									<input
										type="checkbox"
										id="save-to-channel"
										checked={saveToPersonalChannel}
										onChange={(e) => setSaveToPersonalChannel(e.target.checked)}
										className="h-4 w-4 cursor-pointer rounded border-border accent-primary"
									/>
									<Label htmlFor="save-to-channel" className="cursor-pointer font-normal">
										שמירה בערוץ האישי של - <span>{displayName ?? "..."}</span>
									</Label>
								</div>

								<div className="space-y-2">
									<div className="flex items-center gap-2">
										<input
											type="checkbox"
											id="save-to-unit-channel"
											checked={saveToUnitChannel}
											onChange={(e) => setSaveToUnitChannel(e.target.checked)}
											disabled={channelsDisabled}
											className="h-4 w-4 cursor-pointer rounded border-border accent-primary disabled:cursor-not-allowed disabled:opacity-50"
										/>
										<Label
											htmlFor="save-to-unit-channel"
											className={
												channelsDisabled
													? "cursor-not-allowed font-normal opacity-50"
													: "cursor-pointer font-normal"
											}
										>
											שמירה בערוץ יחידה/מכלול
										</Label>
										<Tooltip>
											<TooltipTrigger asChild>
												<Info className="h-4 w-4 shrink-0 cursor-help text-muted-foreground" />
											</TooltipTrigger>
											<TooltipContent className="max-w-64 text-center" side="top">
												ניתן לשמור את הקליפ בערוץ ייעודי של היחידה/המכלול שלך. לפרטים, כתבו לנו
												בצ׳אט התמיכה.
											</TooltipContent>
										</Tooltip>
									</div>

									{saveToUnitChannel && !channelsDisabled && (
										<Popover>
											<PopoverTrigger asChild>
												<button
													type="button"
													className="flex w-full items-center justify-between rounded-md border border-input bg-background px-3 py-2 text-sm shadow-sm hover:bg-accent"
													dir="rtl"
												>
													<span className="text-muted-foreground">
														{selectedChannelIds.length > 0
															? `${selectedChannelIds.length} ערוצים נבחרו`
															: "בחר ערוצים"}
													</span>
													<ChevronDown className="h-4 w-4 shrink-0 opacity-50" />
												</button>
											</PopoverTrigger>
											<PopoverContent
												className="p-0"
												style={{ width: "var(--radix-popover-trigger-width)" }}
												align="start"
											>
												<div className="border-b p-2">
													<input
														type="text"
														placeholder="חיפוש ערוץ..."
														value={channelSearchQuery}
														onChange={(e) => setChannelSearchQuery(e.target.value)}
														className="w-full bg-transparent text-sm outline-none placeholder:text-muted-foreground"
														dir="rtl"
													/>
												</div>
												<ScrollArea className="h-40">
													{filteredChannels.length === 0 ? (
														<div className="px-3 py-4 text-center text-sm text-muted-foreground">
															אין תוצאות
														</div>
													) : (
														filteredChannels.map((channel) => (
															<div
																key={channel._id}
																className="flex cursor-pointer items-center justify-between px-3 py-2 hover:bg-accent"
																onClick={() => toggleChannel(channel._id)}
																dir="rtl"
															>
																<span className="text-sm">{channel.name}</span>
																<input
																	type="checkbox"
																	checked={selectedChannelIds.includes(channel._id)}
																	readOnly
																	className="h-4 w-4 accent-primary pointer-events-none"
																/>
															</div>
														))
													)}
												</ScrollArea>
											</PopoverContent>
										</Popover>
									)}
								</div>
							</div>

							<div className="space-y-2">
								<Label>פורמט ייצוא</Label>
								<div className="flex flex-col gap-2">
									<button
										type="button"
										onClick={() => actions.setExportType("mp4")}
										className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-right transition-colors hover:bg-secondary ${
											exportType === "mp4" ? "border-primary bg-secondary" : "border-border"
										}`}
									>
										<span className="text-sm font-medium">סרטון</span>
										<span className="text-muted-foreground text-xs">קובץ MP4 באיכות גבוהה</span>
									</button>
									<button
										type="button"
										onClick={() => actions.setExportType("webp")}
										className={`flex flex-col gap-0.5 rounded-lg border px-3 py-2.5 text-right transition-colors hover:bg-secondary ${
											exportType === "webp" ? "border-primary bg-secondary" : "border-border"
										}`}
									>
										<span className="text-sm font-medium">תמונה</span>
										<span className="text-muted-foreground text-xs">תמונה של הפריים הנוכחי</span>
									</button>
								</div>
							</div>

							<Button onClick={handleExport} className="w-full" disabled={!isNameValid}>
								ייצא
							</Button>
						</div>
					</div>
				) : isAnalyzingPhase ? (
					<div
						className="flex flex-1 flex-col items-center justify-center gap-4"
						aria-live="polite"
						aria-atomic="true"
					>
						<div className="h-2 w-64 rounded-full bg-muted">
							<div
								className="h-2 rounded-full bg-primary duration-300 motion-safe:transition-[width]"
								style={{ width: `${analysisProgress}%` }}
							/>
						</div>
						<div className="text-center text-zinc-500">
							<div>מנתחים את הנתונים, אנא המתן...</div>
						</div>
					</div>
				) : isSubmittedPhase ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-6 px-8 overflow-y-auto py-6">
						<div className="flex flex-col items-center gap-1 text-center">
							<CircleCheckIcon className="text-primary mb-1 h-8 w-8" aria-hidden="true" />
							<p className="font-bold">אנחנו עובדים על הסרטון שלך</p>
							<p className="text-sm text-zinc-500">נעדכן אותך כשהסרטון יהיה מוכן</p>
						</div>
						<Button variant="outline" onClick={handleReturnHome} className="w-full max-w-sm">
							חזרה לעמוד הראשי
						</Button>
					</div>
				) : isErrorPhase ? (
					<div className="flex flex-1 flex-col items-center justify-center gap-4 px-8 text-center">
						<div className="font-bold">שגיאה בשמירה</div>
						<div className="text-sm text-zinc-500">{error}</div>
						{retryCount < 2 && (
							<Button variant="outline" onClick={handleRetry}>
								נסה שנית
							</Button>
						)}
					</div>
				) : null}
			</DialogContent>
		</Dialog>
	);
};

export default DownloadProgressModal;
