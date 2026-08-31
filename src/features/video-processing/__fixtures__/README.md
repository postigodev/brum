# Video processing fixtures

These tiny synthetic files contain no user media. Regenerate them with FFmpeg 8 or newer from the repository root:

```powershell
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-video.mp4
ffmpeg -f lavfi -i "nullsrc=s=160x120:r=2/3:d=6,geq=r='if(eq(N,0),255,if(eq(N,3),255,0))':g='if(eq(N,1),255,if(eq(N,3),255,0))':b='if(eq(N,2),255,if(eq(N,3),255,0))',format=yuv420p" -c:v libx264 -preset veryslow -crf 18 -g 4 -bf 0 -frames:v 4 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-directional.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=0.979667" -af "asetpts=PTS+0.021333/TB" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -c:a aac -b:a 64k -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=25:duration=0.84" -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=0.979667" -af "asetpts=PTS+0.021333/TB" -c:v libx264 -pix_fmt yuv420p -g 25 -bf 2 -c:a aac -b:a 64k -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac-short-video.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -c:v libx265 -x265-params "log-level=error:pools=1" -pix_fmt yuv420p -tag:v hvc1 -movflags +faststart -y src/features/video-processing/__fixtures__/unsupported-video.mp4
```

`h264-directional.mp4` contains exactly four 160x120 frames over six seconds: red, green, blue, and white (A/B/C/D). It drives the browser-backed forward/reverse regression and makes the supported 15- and 45-second presets stop inside opposite cycle halves. `h264-video.mp4` covers ordinary H.264 processing and cancellation. `h264-aac.mp4` proves that source AAC is discarded from generated output. `h264-aac-short-video.mp4` has a 1-second audio/container timeline and a 0.84-second video track, proving that the visual track controls cycle timing. `unsupported-video.mp4` verifies explicit rejection of non-H.264 video.
