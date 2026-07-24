/* 라이브러리 3D 프로시저럴 메시 — 러너 전용 (three 의존)
   Voxel Sandbox 리디자인(M6.1): 전 사물을 BoxGeometry 조합(복셀)으로 재구성.
   구·원통·원뿔·토러스·캡슐 등 곡면 지오메트리를 사용하지 않는다 — 각진 블록 실루엣만.
   상호작용은 2.5D 판정, 메시는 렌더링 전용(브리프 동결). 판정·스케일 로직 무관, 표현만 교체. */
import * as THREE from 'three';
import { libMeta } from './library-meta.js';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.05, flatShading: true, ...opts });
}

/* 블록 헬퍼: 위치 지정까지 한 번에 (보일러플레이트 축소) */
function box(w, h, d, c, x = 0, y = 0, z = 0, opts) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(w, h, d), mat(c, opts));
  m.position.set(x, y, z);
  return m;
}

/* 정사각 프레임(4개 얇은 박스) — 손잡이·림·고리 등 원형 파츠의 복셀 대체 */
function ringFrame(size, thick, depth, c) {
  const g = new THREE.Group();
  const half = size / 2;
  g.add(box(size, thick, depth, c, 0, half - thick / 2, 0));
  g.add(box(size, thick, depth, c, 0, -half + thick / 2, 0));
  g.add(box(thick, size - thick * 2, depth, c, -half + thick / 2, 0, 0));
  g.add(box(thick, size - thick * 2, depth, c, half - thick / 2, 0, 0));
  return g;
}

const BUILDERS = {
  backpack(c) {
    const g = new THREE.Group();
    g.add(box(1, 1.2, 0.5, c));
    g.add(box(1.02, 0.5, 0.54, '#9b2c2c', 0, 0.4, 0));
    g.add(box(0.5, 0.12, 0.12, '#742a2a', 0, 0.78, 0));
    return g;
  },
  lunchbox(c) {
    const g = new THREE.Group();
    g.add(box(1.3, 0.6, 0.9, c));
    g.add(box(1.34, 0.15, 0.94, '#f6ad55', 0, 0.35, 0));
    return g;
  },
  basket(c) {
    const g = new THREE.Group();
    g.add(box(1.3, 0.6, 0.9, c, 0, -0.05, 0));
    g.add(box(1.36, 0.1, 0.96, '#975a16', 0, 0.3, 0));
    return g;
  },
  cupholder(c) {
    const g = new THREE.Group();
    g.add(box(1.2, 0.15, 0.8, c));
    [-1, 0, 1].forEach(i => {
      const ring = ringFrame(0.3, 0.05, 0.3, '#a0aec0');
      ring.position.set(i * 0.38, 0.12, 0);
      g.add(ring);
    });
    return g;
  },
  pencilcase(c) {
    const g = new THREE.Group();
    g.add(box(1.05, 0.42, 0.3, c));
    g.add(box(1.0, 0.05, 0.05, '#f7fafc', 0, 0.24, 0));
    return g;
  },
  book(c) {
    const g = new THREE.Group();
    g.add(box(0.9, 1.2, 0.18, c));
    g.add(box(0.82, 1.12, 0.14, '#f7fafc', 0.05, 0, 0.01));
    return g;
  },
  apple(c) {
    const g = new THREE.Group();
    g.add(box(0.85, 0.85, 0.85, c));
    g.add(box(0.08, 0.28, 0.08, '#744210', 0, 0.6, 0));
    g.add(box(0.24, 0.1, 0.06, '#48bb78', 0.2, 0.6, 0));
    return g;
  },
  cup(c) {
    const g = new THREE.Group();
    g.add(box(0.7, 1.0, 0.7, c));
    g.add(box(0.76, 0.08, 0.76, c, 0, 0.5, 0));
    return g;
  },
  toothbrush(c) {
    const g = new THREE.Group();
    const handle = box(1.1, 0.16, 0.16, c);
    handle.rotation.z = 0.35;
    handle.position.set(-0.1, -0.15, 0);
    const head = box(0.4, 0.18, 0.2, '#f7fafc', 0.55, 0.5, 0);
    g.add(handle, head);
    return g;
  },
  soap(c) {
    return box(1, 0.45, 0.65, c, 0, 0, 0, { roughness: 0.35 });
  },
  towel(c) {
    const g = new THREE.Group();
    g.add(box(0.9, 1.1, 0.25, c));
    g.add(box(0.92, 0.2, 0.27, '#f7fafc', 0, -0.3, 0));
    return g;
  },
  sock(c) {
    const g = new THREE.Group();
    g.add(box(0.4, 0.75, 0.32, c, 0, 0.1, 0));
    g.add(box(0.55, 0.3, 0.32, c, 0.28, -0.35, 0));
    return g;
  },
  spoon(c) {
    const opts = { metalness: 0.5, roughness: 0.3 };
    const g = new THREE.Group();
    const handle = box(1.0, 0.14, 0.06, c, -0.1, 0, 0, opts);
    handle.rotation.z = 0.1;
    const bowl = box(0.42, 0.32, 0.08, c, 0.52, 0, 0, opts);
    g.add(handle, bowl);
    return g;
  },
  crayon(c) {
    const g = new THREE.Group();
    g.add(box(0.28, 1.0, 0.28, c));
    g.add(box(0.28, 0.3, 0.28, c, 0, 0.65, 0));
    g.add(box(0.3, 0.16, 0.3, '#f7fafc', 0, 0.42, 0));
    g.rotation.z = 0.5;
    return g;
  },
  scissors(c) {
    const opts = { metalness: 0.6, roughness: 0.3 };
    const g = new THREE.Group();
    const b1 = box(1.1, 0.12, 0.05, c, 0, 0, 0, opts);
    const b2 = b1.clone();
    b1.rotation.z = 0.35; b2.rotation.z = -0.35;
    const r1 = ringFrame(0.26, 0.06, 0.06, '#e53e3e');
    const r2 = r1.clone();
    r1.position.set(-0.62, -0.22, 0); r2.position.set(-0.62, 0.22, 0);
    g.add(b1, b2, r1, r2);
    return g;
  },
  bottle(c) {
    const opts = { roughness: 0.2 };
    const g = new THREE.Group();
    g.add(box(0.55, 0.9, 0.55, c, 0, 0, 0, opts));
    g.add(box(0.3, 0.28, 0.3, c, 0, 0.58, 0, opts));
    g.add(box(0.32, 0.14, 0.32, '#f6ad55', 0, 0.79, 0));
    return g;
  },
  hat(c) {
    const g = new THREE.Group();
    g.add(box(0.85, 0.5, 0.85, c, 0, 0.15, 0));
    g.add(box(1.15, 0.08, 1.15, c, 0.1, -0.1, 0));
    return g;
  },
  tray(c) {
    const g = new THREE.Group();
    g.add(box(1.5, 0.08, 1.0, c));
    g.add(box(1.5, 0.18, 0.08, '#975a16', 0, 0.06, 0.46));
    g.add(box(1.5, 0.18, 0.08, '#975a16', 0, 0.06, -0.46));
    g.add(box(0.08, 0.18, 1.0, '#975a16', -0.71, 0.06, 0));
    g.add(box(0.08, 0.18, 1.0, '#975a16', 0.71, 0.06, 0));
    return g;
  },
  banana(c) {
    const g = new THREE.Group();
    // 3세그먼트 각도차로 곡선 실루엣 근사 (곡면 지오메트리 미사용)
    const seg = (i) => {
      const m = box(0.42, 0.16, 0.16, c);
      m.position.set(-0.32 + i * 0.32, 0.1 * i * i, 0);
      m.rotation.z = 0.22 * i;
      return m;
    };
    g.add(seg(0), seg(1), seg(2));
    g.add(box(0.14, 0.16, 0.16, '#744210', 0.66, 0.42, 0));
    return g;
  },
  orange(c) {
    const g = new THREE.Group();
    g.add(box(0.9, 0.82, 0.9, c, 0, 0, 0, { roughness: 0.85 }));
    g.add(box(0.22, 0.08, 0.1, '#48bb78', 0.18, 0.44, 0));
    return g;
  },
  grape(c) {
    const g = new THREE.Group();
    const positions = [[0, 0.3], [-0.22, 0.1], [0.22, 0.1], [-0.11, -0.15], [0.11, -0.15], [0, -0.4]];
    positions.forEach(([x, y]) => g.add(box(0.3, 0.3, 0.3, c, x, y, 0, { roughness: 0.4 })));
    g.add(box(0.06, 0.25, 0.06, '#744210', 0, 0.55, 0));
    return g;
  },
  strawberry(c) {
    const g = new THREE.Group();
    // 위→아래 좁아지는 3단 박스로 원뿔 실루엣 근사
    g.add(box(0.62, 0.28, 0.62, c, 0, 0.24, 0, { roughness: 0.5 }));
    g.add(box(0.42, 0.28, 0.42, c, 0, -0.02, 0, { roughness: 0.5 }));
    g.add(box(0.2, 0.28, 0.2, c, 0, -0.28, 0, { roughness: 0.5 }));
    g.add(box(0.5, 0.14, 0.5, '#48bb78', 0, 0.44, 0));
    return g;
  },
  bread(c) {
    const g = new THREE.Group();
    g.add(box(0.9, 0.55, 0.6, c, 0, 0, 0, { roughness: 0.9 }));
    g.add(box(0.94, 0.24, 0.64, '#b7791f', 0, 0.36, 0, { roughness: 0.9 }));
    return g;
  },
  juice(c) {
    const g = new THREE.Group();
    g.add(box(0.6, 0.9, 0.4, c));
    const straw = box(0.06, 0.5, 0.06, '#f7fafc', 0.15, 0.6, 0);
    straw.rotation.z = -0.3;
    g.add(straw);
    return g;
  },
  shoe(c) {
    const g = new THREE.Group();
    g.add(box(0.85, 0.42, 0.5, c, 0.05, 0.14, 0));
    g.add(box(1.2, 0.12, 0.5, '#f7fafc', 0, -0.12, 0));
    g.add(box(0.42, 0.42, 0.5, c, -0.42, 0.14, 0));
    return g;
  },
  shirt(c) {
    const g = new THREE.Group();
    g.add(box(0.8, 0.9, 0.2, c));
    const armL = box(0.35, 0.5, 0.18, c, -0.55, 0.25, 0);
    const armR = armL.clone();
    armL.rotation.z = 0.4;
    armR.position.x = 0.55; armR.rotation.z = -0.4;
    g.add(armL, armR);
    g.add(box(0.3, 0.1, 0.05, '#f7fafc', 0, 0.48, 0.11));
    return g;
  },
  pencil(c) {
    const g = new THREE.Group();
    g.add(box(0.2, 1.1, 0.2, c));
    g.add(box(0.2, 0.26, 0.2, '#fbd38d', 0, 0.68, 0));
    g.add(box(0.07, 0.09, 0.07, '#2d3748', 0, 0.8, 0));
    g.add(box(0.2, 0.12, 0.2, '#ed64a6', 0, -0.6, 0));
    g.rotation.z = 0.6;
    return g;
  },
  notebook(c) {
    const g = new THREE.Group();
    g.add(box(0.85, 1.1, 0.12, c));
    for (let i = 0; i < 6; i++) g.add(box(0.06, 0.06, 0.16, '#a0aec0', -0.44, 0.45 - i * 0.18, 0.02));
    g.add(box(0.5, 0.3, 0.13, '#f7fafc', 0, 0.2, 0));
    return g;
  },
  cart(c) {
    // 바구니 top=0.6, 손잡이 기둥 bottom을 정확히 그 높이에서 시작해 맞닿게 함
    const g = new THREE.Group();
    g.add(box(1.3, 0.7, 0.9, c, 0, 0.25, 0, { transparent: true, opacity: 0.88 }));
    g.add(box(0.06, 0.35, 0.06, '#a0aec0', -0.48, 0.775, -0.45));
    g.add(box(0.06, 0.35, 0.06, '#a0aec0', 0.48, 0.775, -0.45));
    g.add(box(1.02, 0.08, 0.06, '#a0aec0', 0, 0.99, -0.45));
    [-0.45, 0.45].forEach(x => [-0.3, 0.3].forEach(z =>
      g.add(box(0.22, 0.22, 0.1, '#4a5568', x, -0.22, z))));
    return g;
  },
  shoerack(c) {
    const g = new THREE.Group();
    g.add(box(1.3, 1.2, 0.5, c, 0, 0, -0.05));
    [-0.25, 0.15, 0.55].forEach(y => g.add(box(1.2, 0.05, 0.46, '#d6bc8a', 0, y - 0.15, 0)));
    return g;
  },
  closet(c) {
    const g = new THREE.Group();
    g.add(box(1.1, 1.5, 0.45, c));
    g.add(box(0.03, 1.4, 0.02, '#5f4632', 0, 0, 0.24));
    g.add(box(0.06, 0.06, 0.06, '#ecc94b', -0.1, 0, 0.26));
    g.add(box(0.06, 0.06, 0.06, '#ecc94b', 0.1, 0, 0.26));
    return g;
  },
  sink(c) {
    // 일체형: 받침대-세면볼-수전이 정면(정사영) 뷰에서 붙어 보이도록 같은 평면에 구성
    const g = new THREE.Group();
    g.add(box(0.4, 0.5, 0.4, '#cbd5e0', 0, -0.42, 0));
    g.add(box(1.1, 0.32, 0.7, c, 0, 0, 0));
    g.add(box(0.9, 0.1, 0.5, '#bee3f8', 0, 0.13, 0));
    const opts = { metalness: 0.7, roughness: 0.25 };
    g.add(box(0.12, 0.42, 0.12, '#a0aec0', 0, 0.35, 0, opts));
    g.add(box(0.32, 0.1, 0.1, '#a0aec0', 0.14, 0.55, 0, opts));
    g.add(box(0.1, 0.1, 0.1, '#4fd1c5', -0.14, 0.5, 0));
    return g;
  },
  footmat(c) { // 발판 (신발 신는 자리)
    const g = new THREE.Group();
    g.add(box(1.5, 0.08, 0.95, c));
    g.add(box(1.56, 0.05, 1.0, '#4a5568', 0, -0.04, 0));
    [-0.3, 0.3].forEach(x => g.add(box(0.24, 0.16, 0.5, '#f7fafc', x, 0.06, 0)));
    return g;
  },
  plate(c) {
    const g = new THREE.Group();
    g.add(box(1.3, 0.12, 1.3, c));
    g.add(box(0.95, 0.05, 0.95, '#e2e8f0', 0, 0.07, 0));
    return g;
  },
  desk(c) {
    const g = new THREE.Group();
    g.add(box(1.5, 0.1, 0.9, c, 0, 0.4, 0));
    [[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]].forEach(([x, z]) =>
      g.add(box(0.1, 0.9, 0.1, '#718096', x, -0.05, z)));
    return g;
  },
};

/* size(정규화 반경) → 월드 스케일로 빌드. 스테이션 씬 월드는 x 0~1 좌표계.
   커스텀 GLB(asset:<id>)는 자리표시자를 먼저 반환하고 로드 완료 시 교체(비동기). */
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
const gltfLoader = new GLTFLoader();
const gltfCache = new Map(); // dataURL → Promise<GLTF scene 원본>

export function buildMesh(libKey, scale = 1, assets = null) {
  const meta = libMeta(libKey, assets);
  const g = new THREE.Group();
  let inner;

  if (meta.custom) {
    const asset = assets?.[libKey.slice(6)];
    inner = new THREE.Mesh(new THREE.BoxGeometry(1, 1, 1), mat(meta.color, { transparent: true, opacity: 0.5 }));
    inner.scale.setScalar(meta.size * scale);
    g.add(inner);
    g.userData.spin = inner;
    if (asset?.data) {
      if (!gltfCache.has(asset.data)) gltfCache.set(asset.data, gltfLoader.loadAsync(asset.data));
      gltfCache.get(asset.data).then(gltf => {
        const model = gltf.scene.clone(true);
        // 바운딩 기준 정규화: 최장변 = 지름(size*2*scale)
        const box = new THREE.Box3().setFromObject(model);
        const dim = box.getSize(new THREE.Vector3());
        const maxDim = Math.max(dim.x, dim.y, dim.z) || 1;
        const s = (meta.size * 2 * scale) / maxDim;
        const center = box.getCenter(new THREE.Vector3());
        model.position.sub(center).multiplyScalar(s);
        model.scale.setScalar(s);
        const wrap = new THREE.Group();
        wrap.add(model);
        g.remove(inner);
        g.add(wrap);
        g.userData.spin = wrap;
      }).catch(() => { inner.material.opacity = 1; }); // 로드 실패 → 자리표시자 유지
    }
    return g;
  }

  const builder = BUILDERS[libKey] || (c => new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.8, 0.8), mat(c)));
  inner = builder(meta.color);
  inner.scale.setScalar(meta.size * scale); // 빌더 내부 단위 ~1 → 정규화 반경으로 축소
  g.add(inner);
  g.userData.spin = inner;
  return g;
}
