# 완성 예시 — AAA · 레이저다이오드 설계 기술

출처: "광학 과제 자료2.pdf" (600㎽급 405㎚ 레이저 다이오드 모듈 과제), 기술분류 AA/AB/AC.
형제 소분류(AAB C-Lens·AAC 비구면)와 상호배타: 렌즈/집광/콜리메이터 계열 **배제**.

## 2군 분배
- 디바이스·구조군: 레이저 다이오드(소자/광원) 동의어 + 405nm/UV/소재
- 특성·동작군: 고출력·파장안정/공차·반치폭·빔프로파일·방사각·결맞음·발진파장·side peak·설계

## 블록 1 — 기본 키워드 (국문)
```
((레이저 A/1 다이오드) OR 레이저다이오드 OR 엘디 OR (자외선 A/2 레이저) OR (UV A/2 레이저))
AND
((고출력 OR 고출력화 OR (출력 A/2 (향상 OR 증대 OR 극대화)))
 OR (파장 A/2 (안정* OR 공차)) OR 파장안정성 OR (파장 A/1 잠금)
 OR 반치폭 OR (반치 A/1 폭) OR (스펙트럼 A/2 폭)
 OR (빔 A/1 프로파일) OR (빔 A/2 품질)
 OR 방사각 OR 발산각 OR (방사 A/1 각도)
 OR (부분 A/1 결맞음) OR 가간섭* OR 결맞음
 OR (발진 A/1 파장) OR (중심 A/1 파장)
 OR (사이드 A/1 피크) OR (측면 A/1 피크))
```

## 블록 2 — 확장 키워드 (영문)
```
(("laser diode*" OR "LD" OR (laser A/1 diode*) OR "laser-diode*"
  OR (UV A/2 laser*) OR (ultraviolet A/2 laser*) OR "405nm" OR (405 A/1 nm))
AND
 ((high N/1 (power OR output)) OR "high-power"
  OR (wavelength A/2 (stabil* OR toleranc* OR lock*))
  OR FWHM OR (full A/1 width A/1 half A/1 maximum)
  OR linewidth OR (spectral A/1 (width OR linewidth))
  OR (beam A/1 (profile OR quality OR divergence)) OR "M2"
  OR (divergen* A/1 angle)
  OR (partial* A/1 coheren*) OR coheren*
  OR (lasing A/1 wavelength) OR (emission A/1 wavelength) OR (center A/1 wavelength)
  OR (side A/1 peak*)))
```

## 블록 3 — 통합본 = (국문 전체) OR (영문 전체)  ★기본
```
(
  ((레이저 A/1 다이오드) OR 레이저다이오드 OR 엘디 OR (자외선 A/2 레이저) OR (UV A/2 레이저))
  AND
  ((고출력 OR 고출력화 OR (출력 A/2 (향상 OR 증대 OR 극대화)))
   OR (파장 A/2 (안정* OR 공차)) OR 파장안정성 OR (파장 A/1 잠금)
   OR 반치폭 OR (반치 A/1 폭) OR (스펙트럼 A/2 폭)
   OR (빔 A/1 프로파일) OR (빔 A/2 품질)
   OR 방사각 OR 발산각 OR (방사 A/1 각도)
   OR (부분 A/1 결맞음) OR 가간섭* OR 결맞음
   OR (발진 A/1 파장) OR (중심 A/1 파장)
   OR (사이드 A/1 피크) OR (측면 A/1 피크))
)
OR
(
  ("laser diode*" OR "LD" OR (laser A/1 diode*) OR "laser-diode*"
   OR (UV A/2 laser*) OR (ultraviolet A/2 laser*) OR "405nm" OR (405 A/1 nm))
  AND
  ((high N/1 (power OR output)) OR "high-power"
   OR (wavelength A/2 (stabil* OR toleranc* OR lock*))
   OR FWHM OR (full A/1 width A/1 half A/1 maximum)
   OR linewidth OR (spectral A/1 (width OR linewidth))
   OR (beam A/1 (profile OR quality OR divergence)) OR "M2"
   OR (divergen* A/1 angle)
   OR (partial* A/1 coheren*) OR coheren*
   OR (lasing A/1 wavelength) OR (emission A/1 wavelength) OR (center A/1 wavelength)
   OR (side A/1 peak*))
)
```

## 블록 4 — IPC 결합본
```
[블록3] AND (IPC = H01S5* OR H01S3*)
```

## 조절 가이드 (F원칙)
- 과다 시: 특성군에서 `coheren*`(단독)·`"M2"` 제거, 고출력·파장안정·반치폭 위주로 축소.
- 주의: `제어/control*`·`고정`·`설계*/design*`는 형제 분류(ABA 고정, AAB·AAC·ABA 설계) 침범이라 넣지 않음.
- 과소 시: 405nm 제약 해제 + `(GaN OR 질화갈륨 OR InGaN)` 소재 키워드 OR 추가.
