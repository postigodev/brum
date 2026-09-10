# Video processing fixtures

These tiny synthetic files contain no user media. Regenerate them with FFmpeg 8 or newer from the repository root:

```powershell
ffmpeg -f lavfi -i "nullsrc=s=1920x1080:r=30:d=10,geq=r='if(eq(mod(N,4),0),255,if(eq(mod(N,4),3),255,0))':g='if(eq(mod(N,4),1),255,if(eq(mod(N,4),3),255,0))':b='if(eq(mod(N,4),2),255,if(eq(mod(N,4),3),255,0))',format=yuv420p" -c:v libx264 -preset fast -crf 23 -g 60 -bf 2 -sc_threshold 0 -frames:v 300 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-1080p.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-video.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=30:duration=4" -c:v libx264 -pix_fmt yuv420p -g 30 -bf 2 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-many-frames.mp4
ffmpeg -f lavfi -i "nullsrc=s=160x120:r=2/3:d=6,geq=r='if(eq(N,0),255,if(eq(N,3),255,0))':g='if(eq(N,1),255,if(eq(N,3),255,0))':b='if(eq(N,2),255,if(eq(N,3),255,0))',format=yuv420p" -c:v libx264 -preset veryslow -crf 18 -g 4 -bf 0 -frames:v 4 -movflags +faststart -y src/features/video-processing/__fixtures__/h264-directional.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -f lavfi -i "sine=frequency=440:sample_rate=48000:duration=0.979667" -af "asetpts=PTS+0.021333/TB" -c:v libx264 -pix_fmt yuv420p -g 10 -bf 0 -c:a aac -b:a 64k -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=25:duration=0.84" -f lavfi -i "sine=frequency=880:sample_rate=48000:duration=0.979667" -af "asetpts=PTS+0.021333/TB" -c:v libx264 -pix_fmt yuv420p -g 25 -bf 2 -c:a aac -b:a 64k -movflags +faststart -y src/features/video-processing/__fixtures__/h264-aac-short-video.mp4
ffmpeg -f lavfi -i "testsrc2=size=160x120:rate=10:duration=1" -c:v libx265 -x265-params "log-level=error:pools=1" -pix_fmt yuv420p -tag:v hvc1 -movflags +faststart -y src/features/video-processing/__fixtures__/unsupported-video.mp4
```

`h264-directional.mp4` contains exactly four 160x120 frames over six seconds: red, green, blue, and white (A/B/C/D). It drives the browser-backed forward/reverse regression and makes the supported 15- and 45-second presets stop inside opposite cycle halves. `h264-many-frames.mp4` contains exactly 120 160x120 frames over four seconds and exercises decoder-resource ownership with a small repository footprint. `h264-video.mp4` covers ordinary H.264 processing and cancellation. `h264-aac.mp4` proves that source AAC is discarded from generated output. `h264-aac-short-video.mp4` has a 1-second audio/container timeline and a 0.84-second video track, proving that the visual track controls cycle timing. `unsupported-video.mp4` verifies explicit rejection of non-H.264 video.

`h264-1080p.mp4` has 300 1920x1080 frames at 30 fps over 10 seconds, with a 60-frame GOP
and B-frames. Red/green/blue/white repeats every four frames. The browser regression checks all
450 output states for a 15-second target, crossing many byte-limited ranges in both directions.
Retaining the source as RGBA would require 2,488,320,000 bytes; its synthetic compressed file is
small. The clip contains no personal footage.
