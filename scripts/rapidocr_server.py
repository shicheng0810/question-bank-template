#!/usr/bin/env python3
import argparse
import base64
import json
import os
import re
import sys
import tempfile
from http.server import BaseHTTPRequestHandler, ThreadingHTTPServer


DEFAULT_HOST = "127.0.0.1"
DEFAULT_PORT = 8765
DEFAULT_MODEL = "PP-OCRv5-mobile"


class RapidOcrService:
    def __init__(self, model=DEFAULT_MODEL):
        self.model = model
        self._engine = None

    def recognize_data_url(self, image_data_url):
        mime, image_bytes, suffix = decode_image_data_url(image_data_url)
        engine = self._get_engine()
        with tempfile.NamedTemporaryFile(suffix=suffix, delete=False) as tmp:
            tmp.write(image_bytes)
            tmp_path = tmp.name
        try:
            raw = engine(tmp_path)
        finally:
            try:
                os.unlink(tmp_path)
            except OSError:
                pass
        lines = normalize_rapidocr_output(raw)
        return {
            "engine": "rapidocr",
            "model": self.model,
            "mime": mime,
            "lines": lines,
            "rawText": "\n".join(line["text"] for line in lines if line.get("text")),
        }

    def _get_engine(self):
        if self._engine is not None:
            return self._engine
        try:
            from rapidocr import RapidOCR
        except Exception as exc:
            raise RuntimeError(
                "rapidocr is not installed. Run `npm run rapidocr:install` first."
            ) from exc

        params = build_ppocrv5_params()
        if params:
            try:
                self._engine = RapidOCR(params=params)
                return self._engine
            except TypeError:
                pass
            except Exception:
                # Some RapidOCR versions expose enums but reject params on first install.
                # Fall back to defaults rather than making the local server unusable.
                pass
        self._engine = RapidOCR()
        return self._engine


def build_ppocrv5_params():
    try:
        from rapidocr import EngineType, LangDet, LangRec, ModelType, OCRVersion
    except Exception:
        return {}

    def pick(enum_obj, *names):
        for name in names:
            if hasattr(enum_obj, name):
                return getattr(enum_obj, name)
        return None

    onnx = pick(EngineType, "ONNXRUNTIME", "ONNX")
    mobile = pick(ModelType, "MOBILE")
    version = pick(OCRVersion, "PPOCRV5", "PP_OCRV5")
    det_lang = pick(LangDet, "CH", "MULTI")
    rec_lang = pick(LangRec, "CH", "EN")
    params = {}
    if onnx is not None:
        params["Det.engine_type"] = onnx
        params["Rec.engine_type"] = onnx
        params["Cls.engine_type"] = onnx
    if mobile is not None:
        params["Det.model_type"] = mobile
        params["Rec.model_type"] = mobile
        params["Cls.model_type"] = mobile
    if version is not None:
        params["Det.ocr_version"] = version
        params["Rec.ocr_version"] = version
        params["Cls.ocr_version"] = version
    if det_lang is not None:
        params["Det.lang_type"] = det_lang
    if rec_lang is not None:
        params["Rec.lang_type"] = rec_lang
    return params


def decode_image_data_url(value):
    text = str(value or "").strip()
    match = re.match(r"^data:(image/[a-zA-Z0-9.+-]+);base64,(.+)$", text, re.S)
    if not match:
        raise ValueError("expected a data:image/...;base64 URL")
    mime = match.group(1).lower()
    payload = re.sub(r"\s+", "", match.group(2))
    try:
        image_bytes = base64.b64decode(payload, validate=True)
    except Exception as exc:
        raise ValueError("image data is not valid base64") from exc
    if not image_bytes:
        raise ValueError("image data is empty")
    suffix = {
        "image/jpeg": ".jpg",
        "image/jpg": ".jpg",
        "image/png": ".png",
        "image/webp": ".webp",
        "image/bmp": ".bmp",
    }.get(mime, ".img")
    return mime, image_bytes, suffix


def normalize_rapidocr_output(raw):
    converted = object_to_plain(raw)
    lines = []

    if isinstance(converted, dict):
        boxes = converted.get("boxes") or converted.get("dt_boxes") or converted.get("dtBoxes")
        texts = converted.get("txts") or converted.get("texts") or converted.get("rec_txts")
        scores = converted.get("scores") or converted.get("rec_scores")
        if isinstance(boxes, list) and isinstance(texts, list):
            for index, text in enumerate(texts):
                lines.append(make_line(
                    text=text,
                    confidence=scores[index] if isinstance(scores, list) and index < len(scores) else 0,
                    box=boxes[index] if index < len(boxes) else None,
                ))
        elif isinstance(converted.get("lines"), list):
            for item in converted["lines"]:
                lines.append(make_line_from_mapping(item))
        else:
            for key in sorted(converted.keys(), key=lambda item: str(item)):
                item = converted[key]
                if isinstance(item, dict):
                    lines.append(make_line_from_mapping(item))
    elif isinstance(converted, (list, tuple)):
        if len(converted) >= 3 and isinstance(converted[0], list) and isinstance(converted[1], list):
            boxes, texts, scores = converted[0], converted[1], converted[2]
            for index, text in enumerate(texts):
                lines.append(make_line(
                    text=text,
                    confidence=scores[index] if isinstance(scores, list) and index < len(scores) else 0,
                    box=boxes[index] if index < len(boxes) else None,
                ))
        else:
            for item in converted:
                if isinstance(item, dict):
                    lines.append(make_line_from_mapping(item))
                elif isinstance(item, (list, tuple)) and len(item) >= 2:
                    lines.append(make_line(
                        text=item[1],
                        confidence=item[2] if len(item) >= 3 else 0,
                        box=item[0],
                    ))

    return sorted(
        [line for line in lines if line and line.get("text") and line.get("box")],
        key=lambda line: (box_top(line["box"]), box_left(line["box"])),
    )


def object_to_plain(value):
    if hasattr(value, "to_dict"):
        return value.to_dict()
    if hasattr(value, "to_json"):
        maybe_json = value.to_json()
        if isinstance(maybe_json, str):
            return json.loads(maybe_json)
        return maybe_json
    if hasattr(value, "__dict__") and not isinstance(value, type):
        data = {}
        for key in ("boxes", "txts", "scores", "lines", "results"):
            if hasattr(value, key):
                data[key] = object_to_plain(getattr(value, key))
        if data:
            return data
    if hasattr(value, "tolist"):
        return value.tolist()
    if isinstance(value, dict):
        return {key: object_to_plain(item) for key, item in value.items()}
    if isinstance(value, (list, tuple)):
        return [object_to_plain(item) for item in value]
    return value


def make_line_from_mapping(item):
    return make_line(
        text=item.get("text") or item.get("txt") or item.get("rec_txt") or item.get("recText") or "",
        confidence=item.get("confidence", item.get("score", item.get("rec_score", 0))),
        box=item.get("box") or item.get("bbox") or item.get("dt_boxes") or item.get("dtBoxes"),
    )


def make_line(text, confidence, box):
    normalized_box = normalize_box(box)
    if not normalized_box:
        return None
    return {
        "text": normalize_text(text),
        "confidence": float(confidence or 0),
        "box": normalized_box,
    }


def normalize_box(box):
    if not box:
        return None
    if isinstance(box, dict):
        if all(key in box for key in ("x0", "y0", "x1", "y1")):
            return [
                [float(box["x0"]), float(box["y0"])],
                [float(box["x1"]), float(box["y0"])],
                [float(box["x1"]), float(box["y1"])],
                [float(box["x0"]), float(box["y1"])],
            ]
        return None
    points = object_to_plain(box)
    if not isinstance(points, list):
        return None
    clean = []
    for point in points[:4]:
        if isinstance(point, dict):
            x = point.get("x")
            y = point.get("y")
        elif isinstance(point, (list, tuple)) and len(point) >= 2:
            x, y = point[0], point[1]
        else:
            return None
        try:
            clean.append([float(x), float(y)])
        except (TypeError, ValueError):
            return None
    return clean if len(clean) >= 4 else None


def box_top(box):
    return min(point[1] for point in box)


def box_left(box):
    return min(point[0] for point in box)


def normalize_text(value):
    return re.sub(r"\s+", " ", str(value or "").replace("\u00a0", " ")).strip()


class RapidOcrHandler(BaseHTTPRequestHandler):
    service = None

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def do_GET(self):
        if self.path.rstrip("/") == "/health":
            self.send_json(200, {"ok": True, "engine": "rapidocr", "model": self.service.model})
            return
        self.send_json(404, {"error": "not found"})

    def do_POST(self):
        if self.path.rstrip("/") != "/ocr":
            self.send_json(404, {"error": "not found"})
            return
        try:
            length = int(self.headers.get("content-length") or "0")
            raw = self.rfile.read(length).decode("utf-8")
            body = json.loads(raw or "{}")
            image_data_url = body.get("imageDataUrl") or body.get("image_data_url")
            result = self.service.recognize_data_url(image_data_url)
            self.send_json(200, result)
        except Exception as exc:
            self.send_json(500, {"error": str(exc)})

    def send_json(self, status, body):
        data = json.dumps(body, ensure_ascii=False).encode("utf-8")
        self.send_response(status)
        self.send_header("content-type", "application/json; charset=utf-8")
        self.send_header("cache-control", "no-store")
        self.send_header("content-length", str(len(data)))
        self.end_headers()
        self.wfile.write(data)


def run_self_test():
    sample = "data:image/png;base64," + base64.b64encode(b"abc").decode("ascii")
    mime, payload, suffix = decode_image_data_url(sample)
    assert mime == "image/png"
    assert payload == b"abc"
    assert suffix == ".png"
    lines = normalize_rapidocr_output({
        "boxes": [
            [[10, 100], [200, 100], [200, 130], [10, 130]],
            [[10, 10], [200, 10], [200, 40], [10, 40]],
        ],
        "txts": ["Second", "First"],
        "scores": [0.8, 0.9],
    })
    assert [line["text"] for line in lines] == ["First", "Second"]
    print("rapidocr_server self-test ok")


def main(argv=None):
    parser = argparse.ArgumentParser(description="Local RapidOCR PP-OCRv5 HTTP server for Question Bank.")
    parser.add_argument("--host", default=DEFAULT_HOST)
    parser.add_argument("--port", type=int, default=DEFAULT_PORT)
    parser.add_argument("--model", default=DEFAULT_MODEL)
    parser.add_argument("--self-test", action="store_true")
    args = parser.parse_args(argv)

    if args.self_test:
        run_self_test()
        return 0

    RapidOcrHandler.service = RapidOcrService(model=args.model)
    server = ThreadingHTTPServer((args.host, args.port), RapidOcrHandler)
    print(f"RapidOCR server listening on http://{args.host}:{args.port}", flush=True)
    server.serve_forever()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
