import { useEffect, useRef } from 'react';
import { Jobs, InvoiceJobs } from '@/App';

type JobState = Jobs[keyof Jobs] | InvoiceJobs[keyof InvoiceJobs];
type SetJobsState<T> = React.Dispatch<React.SetStateAction<T>>;

export function useJobTimer<T extends Jobs | InvoiceJobs>(jobsState: T, setJobsState: SetJobsState<T>, jobType: 'ticket' | 'invoice') {
    const timersRef = useRef<{ [key: string]: { processing?: NodeJS.Timeout, countdown?: NodeJS.Timeout } }>({});

    // Create a dependency string based on the processing and paused status of all jobs.
    // This ensures the useEffect hook only re-runs when a job starts, stops, pauses, or resumes.
    const jobStatuses = Object.values(jobsState as Record<string, JobState>)
        .map(job => `${job.isProcessing}-${job.isPaused}`)
        .join(',');

    useEffect(() => {
        const timers = timersRef.current;

        Object.keys(jobsState).forEach(profileName => {
            const job = jobsState[profileName as keyof T] as JobState | undefined;
            const timerKey = `${profileName}_${jobType}`;

            if (!job) return;
            if (!timers[timerKey]) timers[timerKey] = {};

            const isProcessingTimerRunning = !!timers[timerKey].processing;
            const isCountdownTimerRunning = !!timers[timerKey].countdown;

            // Handle the main processing timer
            if (job.isProcessing && !job.isPaused && !isProcessingTimerRunning) {
                timers[timerKey].processing = setInterval(() => {
                    setJobsState(prev => {
                        const currentJob = prev[profileName as keyof T];
                        if (!currentJob || !currentJob.isProcessing || currentJob.isPaused) {
                            return prev;
                        }
                        return {
                            ...prev,
                            [profileName]: {
                                ...currentJob,
                                processingTime: (currentJob.processingTime || 0) + 1
                            }
                        };
                    });
                }, 1000);
            } else if ((!job.isProcessing || job.isPaused) && isProcessingTimerRunning) {
                clearInterval(timers[timerKey].processing);
                delete timers[timerKey].processing;
            }

            // Handle the countdown timer
            if (job.isProcessing && !job.isPaused && job.countdown > 0 && !isCountdownTimerRunning) {
                timers[timerKey].countdown = setInterval(() => {
                    setJobsState(prev => {
                        const currentJob = prev[profileName as keyof T];
                        if (!currentJob || currentJob.countdown <= 0) {
                            if (timers[timerKey]?.countdown) {
                                clearInterval(timers[timerKey].countdown);
                                delete timers[timerKey].countdown;
                            }
                            return prev;
                        }
                        const newCountdown = currentJob.countdown - 1;
                        return { ...prev, [profileName]: { ...currentJob, countdown: newCountdown } };
                    });
                }, 1000);
            } else if ((job.countdown <= 0 || !job.isProcessing || job.isPaused) && isCountdownTimerRunning) {
                clearInterval(timers[timerKey].countdown);
                delete timers[timerKey].countdown;
            }
        });

        return () => {
            Object.values(timers).forEach(t => {
                if (t.processing) clearInterval(t.processing);
                if (t.countdown) clearInterval(t.countdown);
            });
            timersRef.current = {};
        };
    // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [jobStatuses, setJobsState, jobType]);
}