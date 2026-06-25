from google.protobuf.internal import containers as _containers
from google.protobuf import descriptor as _descriptor
from google.protobuf import message as _message
from collections.abc import Iterable as _Iterable, Mapping as _Mapping
from typing import ClassVar as _ClassVar, Optional as _Optional, Union as _Union

DESCRIPTOR: _descriptor.FileDescriptor

class ExtractionRequest(_message.Message):
    __slots__ = ("image_bytes", "image_format")
    IMAGE_BYTES_FIELD_NUMBER: _ClassVar[int]
    IMAGE_FORMAT_FIELD_NUMBER: _ClassVar[int]
    image_bytes: _containers.RepeatedScalarFieldContainer[bytes]
    image_format: str
    def __init__(self, image_bytes: _Optional[_Iterable[bytes]] = ..., image_format: _Optional[str] = ...) -> None: ...

class DetectedObject(_message.Message):
    __slots__ = ("label", "confidence", "x_min", "y_min", "x_max", "y_max")
    LABEL_FIELD_NUMBER: _ClassVar[int]
    CONFIDENCE_FIELD_NUMBER: _ClassVar[int]
    X_MIN_FIELD_NUMBER: _ClassVar[int]
    Y_MIN_FIELD_NUMBER: _ClassVar[int]
    X_MAX_FIELD_NUMBER: _ClassVar[int]
    Y_MAX_FIELD_NUMBER: _ClassVar[int]
    label: str
    confidence: float
    x_min: float
    y_min: float
    x_max: float
    y_max: float
    def __init__(self, label: _Optional[str] = ..., confidence: _Optional[float] = ..., x_min: _Optional[float] = ..., y_min: _Optional[float] = ..., x_max: _Optional[float] = ..., y_max: _Optional[float] = ...) -> None: ...

class ExtractionResponse(_message.Message):
    __slots__ = ("objects",)
    OBJECTS_FIELD_NUMBER: _ClassVar[int]
    objects: _containers.RepeatedCompositeFieldContainer[DetectedObject]
    def __init__(self, objects: _Optional[_Iterable[_Union[DetectedObject, _Mapping]]] = ...) -> None: ...
