#!/usr/bin/env python3
"""Prueba el montaje real con FFmpeg, sin red ni clips de pago."""
import array
import copy
import importlib.util
import json
import math
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[1]
spec = importlib.util.spec_from_file_location('ugc_montage', ROOT / 'scripts/ugc-montage.py')
montage = importlib.util.module_from_spec(spec)
spec.loader.exec_module(montage)


def run(*args):
    return subprocess.run(args, check=True, capture_output=True).stdout


@unittest.skipUnless(shutil.which('ffmpeg') and shutil.which('ffprobe'), 'Requiere FFmpeg y FFprobe')
class MontageTest(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.temp = tempfile.TemporaryDirectory(prefix="dropflex montage's ")
        cls.folder = Path(cls.temp.name)
        for name, color, duration, tone in [('A1', 'red', 2, 440), ('A2', 'green', 2, 660), ('B1', 'blue', 1.5, 990), ('B2', 'yellow', .75, None)]:
            cmd = ['ffmpeg', '-y', '-v', 'error', '-f', 'lavfi', '-i', f'color=c={color}:s=90x160:r=24:d={duration}']
            if tone:
                cmd += ['-f', 'lavfi', '-i', f'sine=frequency={tone}:sample_rate=48000:duration={duration}', '-c:a', 'pcm_s16le']
            run(*cmd, '-c:v', 'ffv1', str(cls.folder / f'{name}.mkv'))
        cls.pkg = {'version': 2, 'name': 'plain', 'a_roll': [
            {'key': 'A1', 'line': 'Mira el producto ahora', 'seconds': .5, 'url': 'A1.mkv'},
            {'key': 'A2', 'line': 'Esto sirve cada día', 'seconds': 15, 'url': 'A2.mkv'}], 'b_roll': [
            {'key': 'B1', 'anchor': 'producto', 'cut_s': 1.5, 'url': 'B1.mkv'},
            {'key': 'B2', 'anchor': 'sirve', 'cut_s': 2, 'url': 'B2.mkv'}],
            'text_beats': [{'anchor': 'producto', 'text': 'CAPTION NO DEBE APARECER'}],
            'end_card': {'image_url': 'https://invalid.example/no-download', 'title': 'Cierre'},
            'watermark': 'NO DEBE APARECER', 'accent_color': 'invalid', 'look': 'phone',
            'editing_brief': {'captions': 'karaoke', 'sound': 'música', 'art_direction': 'zoom'}}
        cls.output = cls.folder / 'plain.mp4'
        cls.work = cls.folder / 'work'
        # Un montaje histórico no puede colar efectos desde su caché.
        cls.work.mkdir()
        (cls.work / 'A1_v.mp4').write_bytes(b'cached historical zoom')
        montage.montage(cls.pkg, cls.folder, cls.work, cls.output, 25)

    @classmethod
    def tearDownClass(cls):
        cls.temp.cleanup()

    def frame(self, second):
        raw = run('ffmpeg', '-v', 'error', '-ss', str(second), '-i', str(self.output), '-frames:v', '1', '-vf', 'scale=1:1', '-f', 'rawvideo', '-pix_fmt', 'rgb24', '-')
        return tuple(raw)

    def test_spoken_clips_supports_and_no_added_closing(self):
        data = json.loads(run('ffprobe', '-v', 'error', '-show_streams', '-show_format', '-of', 'json', str(self.output)))
        self.assertEqual([s['codec_type'] for s in data['streams']], ['video', 'audio'])
        self.assertAlmostEqual(float(data['format']['duration']), 4, delta=.06)
        video = data['streams'][0]
        self.assertEqual((video['width'], video['height'], video['codec_name']), (720, 1280, 'h264'))
        # B1 atraviesa el cambio de clip hablado. Ambos apoyos están visibles.
        for second, dominant in [(.2, 0), (1.5, 2), (2.1, 2)]:
            pixel = self.frame(second)
            self.assertGreater(pixel[dominant], 200)
            self.assertLess(sum(pixel) - pixel[dominant], 35)
        r, g, b = self.frame(2.9)
        self.assertGreater(min(r, g), 200)
        self.assertLess(b, 20)
        r, g, b = self.frame(3.9)
        self.assertGreater(g, 100)
        self.assertLess(r + b, 30)

    def test_voice_continues_under_support_without_its_audio(self):
        samples = array.array('f', run('ffmpeg', '-v', 'error', '-i', str(self.output), '-map', '0:a:0', '-ac', '1', '-ar', '48000', '-f', 'f32le', '-'))
        if __import__('sys').byteorder != 'little':
            samples.byteswap()
        for start, frequency in [(0.05, 440), (1.5, 440), (2.5, 660), (3.85, 660)]:
            segment = samples[round(start * 48000):round((start + .1) * 48000)]
            def energy(freq):
                return abs(sum(x * complex(math.cos(2 * math.pi * freq * i / 48000), math.sin(2 * math.pi * freq * i / 48000)) for i, x in enumerate(segment)))
            self.assertGreater(energy(frequency), 200)
            self.assertLess(energy(990), energy(frequency) / 30)

    def test_legacy_layers_ignored_and_v1_accepted(self):
        clean = copy.deepcopy(self.pkg)
        for key in ['text_beats', 'end_card', 'watermark', 'accent_color', 'look', 'editing_brief']:
            clean.pop(key)
        clean['version'] = 1
        clean_path = self.folder / 'clean.mp4'
        path = self.folder / 'wrapped.json'
        path.write_text(json.dumps({'structuredContent': {'data': {'package': clean}}}))
        run('python3', str(ROOT / 'scripts/ugc-montage.py'), str(path), '--work', str(self.work), '--out', str(clean_path))
        def decoded(path, stream, fmt):
            return run('ffmpeg', '-v', 'error', '-i', str(path), '-map', stream, '-f', fmt, '-')
        self.assertEqual(decoded(self.output, '0:v:0', 'rawvideo'), decoded(clean_path, '0:v:0', 'rawvideo'))
        self.assertEqual(decoded(self.output, '0:a:0', 'f32le'), decoded(clean_path, '0:a:0', 'f32le'))
        self.assertFalse(list(self.work.glob('*.png')))

    def test_missing_voice_and_anchor_fail(self):
        broken = copy.deepcopy(self.pkg)
        broken['a_roll'][0]['url'] = 'B2.mkv'
        with self.assertRaisesRegex(ValueError, 'no tiene audio'):
            montage.montage(broken, self.folder, self.work, self.folder / 'broken.mp4', 25)
        broken = copy.deepcopy(self.pkg)
        broken['b_roll'][0]['anchor'] = 'inexistente'
        with self.assertRaisesRegex(ValueError, 'ancla'):
            montage.montage(broken, self.folder, self.work, self.folder / 'broken.mp4', 25)
        with self.assertRaisesRegex(ValueError, 'reemplazar un clip'):
            montage.montage(self.pkg, self.folder, self.work, self.folder / 'A1.mkv', 25)

    def test_opening_insert_and_no_support(self):
        pkg = copy.deepcopy(self.pkg)
        pkg['opening'] = {'insert': 'B1'}
        pkg['b_roll'] = pkg['b_roll'][:1]
        output = self.folder / 'opening.mp4'
        montage.montage(pkg, self.folder, self.work, output, 25)
        original = self.output
        self.output = output
        try:
            self.assertGreater(self.frame(.2)[2], 200)
        finally:
            self.output = original
        pkg['b_roll'] = []
        output = self.folder / 'spoken.mp4'
        montage.montage(pkg, self.folder, self.work, output, 25)
        self.assertAlmostEqual(montage.probe(output)['duration'], 4, delta=.06)

    def test_distributed_script_is_canonical(self):
        self.assertEqual((ROOT / 'scripts/ugc-montage.py').read_bytes(), (ROOT / 'plugins/dropflex-optimizer/skills/optimize-product/scripts/ugc-montage.py').read_bytes())


if __name__ == '__main__':
    unittest.main()
