/* 라이브러리 3D 프로시저럴 메시 — 러너 전용 (three 의존)
   상호작용은 2.5D 판정, 메시는 렌더링 전용 (브리프 동결) */
import * as THREE from 'three';
import { libMeta } from './library-meta.js';

function mat(color, opts = {}) {
  return new THREE.MeshStandardMaterial({ color, roughness: 0.6, metalness: 0.05, ...opts });
}

const BUILDERS = {
  backpack(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1, 1.2, 0.5), mat(c));
    const flap = new THREE.Mesh(new THREE.BoxGeometry(1.02, 0.5, 0.54), mat('#9b2c2c'));
    flap.position.y = 0.4;
    const strap = new THREE.Mesh(new THREE.TorusGeometry(0.25, 0.06, 8, 16), mat('#742a2a'));
    strap.position.set(0, 0.75, 0);
    g.add(body, flap, strap);
    return g;
  },
  lunchbox(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.6, 0.9), mat(c)));
    const lid = new THREE.Mesh(new THREE.BoxGeometry(1.34, 0.15, 0.94), mat('#f6ad55'));
    lid.position.y = 0.35;
    g.add(lid);
    return g;
  },
  basket(c) {
    const g = new THREE.Group();
    const b = new THREE.Mesh(new THREE.CylinderGeometry(0.7, 0.5, 0.7, 12, 1, true), mat(c, { side: THREE.DoubleSide }));
    const rim = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.06, 8, 20), mat('#975a16'));
    rim.rotation.x = Math.PI / 2; rim.position.y = 0.35;
    g.add(b, rim);
    return g;
  },
  cupholder(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.15, 0.8), mat(c)));
    for (let i = -1; i <= 1; i++) {
      const ring = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.04, 8, 16), mat('#a0aec0'));
      ring.rotation.x = Math.PI / 2; ring.position.set(i * 0.38, 0.12, 0);
      g.add(ring);
    }
    return g;
  },
  pencilcase(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.28, 1.0, 4, 12), mat(c));
    body.rotation.z = Math.PI / 2;
    const zip = new THREE.Mesh(new THREE.BoxGeometry(1.0, 0.05, 0.05), mat('#f7fafc'));
    zip.position.y = 0.26;
    g.add(body, zip);
    return g;
  },
  book(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.2, 0.18), mat(c)));
    const pages = new THREE.Mesh(new THREE.BoxGeometry(0.82, 1.12, 0.14), mat('#f7fafc'));
    pages.position.x = 0.05;
    g.add(pages);
    return g;
  },
  apple(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), mat(c)));
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.3), mat('#744210'));
    stem.position.y = 0.6;
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#48bb78'));
    leaf.scale.set(1.6, 0.5, 1); leaf.position.set(0.15, 0.65, 0);
    g.add(stem, leaf);
    return g;
  },
  cup(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.CylinderGeometry(0.4, 0.32, 1.0, 16, 1, true), mat(c, { side: THREE.DoubleSide })));
    const bottom = new THREE.Mesh(new THREE.CircleGeometry(0.32, 16), mat(c));
    bottom.rotation.x = -Math.PI / 2; bottom.position.y = -0.5;
    g.add(bottom);
    return g;
  },
  toothbrush(c) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.09, 1.2, 4, 8), mat(c));
    handle.rotation.z = Math.PI / 2.4;
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.18, 0.16), mat('#f7fafc'));
    head.position.set(0.55, 0.5, 0);
    g.add(handle, head);
    return g;
  },
  soap(c) {
    const s = new THREE.Mesh(new THREE.BoxGeometry(1, 0.45, 0.65), mat(c, { roughness: 0.3 }));
    s.geometry.translate(0, 0, 0);
    return s;
  },
  towel(c) {
    const g = new THREE.Group();
    const t = new THREE.Mesh(new THREE.BoxGeometry(0.9, 1.1, 0.25), mat(c));
    const stripe = new THREE.Mesh(new THREE.BoxGeometry(0.92, 0.2, 0.27), mat('#f7fafc'));
    stripe.position.y = -0.3;
    g.add(t, stripe);
    return g;
  },
  sock(c) {
    const g = new THREE.Group();
    const leg = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.7, 4, 10), mat(c));
    const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.22, 0.4, 4, 10), mat(c));
    foot.rotation.z = Math.PI / 2; foot.position.set(0.25, -0.45, 0);
    g.add(leg, foot);
    return g;
  },
  spoon(c) {
    const g = new THREE.Group();
    const handle = new THREE.Mesh(new THREE.CapsuleGeometry(0.07, 1.0, 4, 8), mat(c, { metalness: 0.5, roughness: 0.3 }));
    handle.rotation.z = Math.PI / 2.2;
    const bowl = new THREE.Mesh(new THREE.SphereGeometry(0.24, 12, 8), mat(c, { metalness: 0.5, roughness: 0.3 }));
    bowl.scale.set(1, 0.45, 0.75); bowl.position.set(0.5, 0.45, 0);
    g.add(handle, bowl);
    return g;
  },
  crayon(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.14, 1.0, 10), mat(c));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.14, 0.3, 10), mat(c));
    tip.position.y = 0.65;
    const band = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.2, 10), mat('#f7fafc'));
    g.add(body, tip, band);
    g.rotation.z = 0.5;
    return g;
  },
  scissors(c) {
    const g = new THREE.Group();
    const b1 = new THREE.Mesh(new THREE.BoxGeometry(1.1, 0.12, 0.05), mat(c, { metalness: 0.6, roughness: 0.3 }));
    const b2 = b1.clone();
    b1.rotation.z = 0.35; b2.rotation.z = -0.35;
    const r1 = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 8, 16), mat('#e53e3e'));
    const r2 = r1.clone();
    r1.position.set(-0.62, -0.22, 0); r2.position.set(-0.62, 0.22, 0);
    g.add(b1, b2, r1, r2);
    return g;
  },
  bottle(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.3, 0.3, 0.9, 14), mat(c, { roughness: 0.2 }));
    const neck = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.22, 0.3, 14), mat(c, { roughness: 0.2 }));
    neck.position.y = 0.6;
    const cap = new THREE.Mesh(new THREE.CylinderGeometry(0.15, 0.15, 0.16, 14), mat('#f6ad55'));
    cap.position.y = 0.8;
    g.add(body, neck, cap);
    return g;
  },
  hat(c) {
    const g = new THREE.Group();
    const dome = new THREE.Mesh(new THREE.SphereGeometry(0.5, 16, 10, 0, Math.PI * 2, 0, Math.PI / 2), mat(c));
    const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.55, 0.06, 20), mat(c));
    brim.position.set(0.35, 0, 0); brim.scale.x = 1.6;
    g.add(dome, brim);
    return g;
  },
  tray(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 1.0), mat(c)));
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.18, 0.08), mat('#975a16'));
    const rim2 = rim.clone();
    rim.position.set(0, 0.06, 0.46); rim2.position.set(0, 0.06, -0.46);
    const rimL = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.18, 1.0), mat('#975a16'));
    const rimR = rimL.clone();
    rimL.position.set(-0.71, 0.06, 0); rimR.position.set(0.71, 0.06, 0);
    g.add(rim, rim2, rimL, rimR);
    return g;
  },
  banana(c) {
    const g = new THREE.Group();
    const curve = new THREE.TorusGeometry(0.5, 0.16, 8, 12, Math.PI * 0.9);
    const body = new THREE.Mesh(curve, mat(c));
    body.rotation.z = -0.4;
    const tip = new THREE.Mesh(new THREE.CylinderGeometry(0.06, 0.09, 0.16, 8), mat('#744210'));
    tip.position.set(0.42, 0.42, 0);
    g.add(body, tip);
    return g;
  },
  orange(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.SphereGeometry(0.5, 14, 10), mat(c, { roughness: 0.8 })));
    const leaf = new THREE.Mesh(new THREE.SphereGeometry(0.12, 8, 6), mat('#48bb78'));
    leaf.scale.set(1.5, 0.4, 1); leaf.position.y = 0.5;
    g.add(leaf);
    g.scale.y = 0.9;
    return g;
  },
  grape(c) {
    const g = new THREE.Group();
    const positions = [[0, 0.3], [-0.22, 0.1], [0.22, 0.1], [-0.11, -0.15], [0.11, -0.15], [0, -0.4]];
    positions.forEach(([x, y]) => {
      const b = new THREE.Mesh(new THREE.SphereGeometry(0.18, 10, 8), mat(c, { roughness: 0.4 }));
      b.position.set(x, y, 0);
      g.add(b);
    });
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.03, 0.03, 0.25), mat('#744210'));
    stem.position.y = 0.55;
    g.add(stem);
    return g;
  },
  strawberry(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.ConeGeometry(0.4, 0.8, 12), mat(c, { roughness: 0.5 }));
    body.rotation.x = Math.PI;
    const cap = new THREE.Mesh(new THREE.ConeGeometry(0.28, 0.2, 6), mat('#48bb78'));
    cap.position.y = 0.45;
    g.add(body, cap);
    return g;
  },
  bread(c) {
    const g = new THREE.Group();
    const loaf = new THREE.Mesh(new THREE.CapsuleGeometry(0.35, 0.7, 4, 10), mat(c, { roughness: 0.9 }));
    loaf.rotation.z = Math.PI / 2; loaf.scale.y = 0.75;
    const crust = new THREE.Mesh(new THREE.CapsuleGeometry(0.36, 0.7, 4, 10), mat('#b7791f', { roughness: 0.9 }));
    crust.rotation.z = Math.PI / 2; crust.scale.set(1, 0.4, 1); crust.position.y = 0.18;
    g.add(loaf, crust);
    return g;
  },
  juice(c) {
    const g = new THREE.Group();
    const box = new THREE.Mesh(new THREE.BoxGeometry(0.6, 0.9, 0.4), mat(c));
    const straw = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mat('#f7fafc'));
    straw.position.set(0.15, 0.6, 0); straw.rotation.z = -0.3;
    g.add(box, straw);
    return g;
  },
  shoe(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CapsuleGeometry(0.25, 0.7, 4, 10), mat(c));
    body.rotation.z = Math.PI / 2; body.position.y = 0.1;
    const sole = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.12, 0.5), mat('#f7fafc'));
    sole.position.y = -0.12;
    const heel = new THREE.Mesh(new THREE.SphereGeometry(0.26, 10, 8), mat(c));
    heel.position.set(-0.42, 0.18, 0);
    g.add(body, sole, heel);
    return g;
  },
  shirt(c) {
    const g = new THREE.Group();
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.8, 0.9, 0.2), mat(c));
    const armL = new THREE.Mesh(new THREE.BoxGeometry(0.35, 0.5, 0.18), mat(c));
    const armR = armL.clone();
    armL.position.set(-0.55, 0.25, 0); armL.rotation.z = 0.4;
    armR.position.set(0.55, 0.25, 0); armR.rotation.z = -0.4;
    const collar = new THREE.Mesh(new THREE.TorusGeometry(0.16, 0.05, 6, 12), mat('#f7fafc'));
    collar.position.y = 0.48; collar.rotation.x = Math.PI / 2.5;
    g.add(torso, armL, armR, collar);
    return g;
  },
  pencil(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 1.1, 6), mat(c));
    const tip = new THREE.Mesh(new THREE.ConeGeometry(0.1, 0.25, 6), mat('#fbd38d'));
    tip.position.y = 0.67;
    const lead = new THREE.Mesh(new THREE.ConeGeometry(0.035, 0.09, 6), mat('#2d3748'));
    lead.position.y = 0.78;
    const eraser = new THREE.Mesh(new THREE.CylinderGeometry(0.1, 0.1, 0.12, 6), mat('#ed64a6'));
    eraser.position.y = -0.6;
    g.add(body, tip, lead, eraser);
    g.rotation.z = 0.6;
    return g;
  },
  notebook(c) {
    const g = new THREE.Group();
    g.add(new THREE.Mesh(new THREE.BoxGeometry(0.85, 1.1, 0.12), mat(c)));
    const spiral = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.05, 8), mat('#a0aec0'));
    spiral.position.set(-0.44, 0, 0.02);
    const label = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.3, 0.13), mat('#f7fafc'));
    label.position.y = 0.2;
    g.add(spiral, label);
    return g;
  },
  cart(c) {
    const g = new THREE.Group();
    const basket = new THREE.Mesh(new THREE.BoxGeometry(1.3, 0.7, 0.9), mat(c, { transparent: true, opacity: 0.85 }));
    basket.position.y = 0.25;
    const handle = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 1.0, 8), mat('#a0aec0'));
    handle.rotation.z = Math.PI / 2; handle.position.set(0, 0.85, -0.45);
    const post1 = new THREE.Mesh(new THREE.CylinderGeometry(0.04, 0.04, 0.5, 6), mat('#a0aec0'));
    const post2 = post1.clone();
    post1.position.set(-0.48, 0.7, -0.45); post2.position.set(0.48, 0.7, -0.45);
    [-0.45, 0.45].forEach(x => [-0.3, 0.3].forEach(z => {
      const w = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.12, 0.06, 10), mat('#2d3748'));
      w.rotation.x = Math.PI / 2; w.position.set(x, -0.2, z);
      g.add(w);
    }));
    g.add(basket, handle, post1, post2);
    return g;
  },
  shoerack(c) {
    const g = new THREE.Group();
    const frame = new THREE.Mesh(new THREE.BoxGeometry(1.3, 1.2, 0.5), mat(c));
    [-0.25, 0.15, 0.55].forEach(y => {
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.05, 0.46), mat('#d6bc8a'));
      shelf.position.y = y - 0.15;
      g.add(shelf);
    });
    g.add(frame);
    frame.position.z = -0.05;
    return g;
  },
  closet(c) {
    const g = new THREE.Group();
    const body = new THREE.Mesh(new THREE.BoxGeometry(1.1, 1.5, 0.45), mat(c));
    const doorLine = new THREE.Mesh(new THREE.BoxGeometry(0.03, 1.4, 0.47), mat('#5f4632'));
    const knob1 = new THREE.Mesh(new THREE.SphereGeometry(0.05, 8, 6), mat('#ecc94b'));
    const knob2 = knob1.clone();
    knob1.position.set(-0.1, 0, 0.24); knob2.position.set(0.1, 0, 0.24);
    g.add(body, doorLine, knob1, knob2);
    return g;
  },
  sink(c) {
    // 일체형: 받침대-세면볼-수전이 정면(정사영) 뷰에서 붙어 보이도록 같은 평면에 구성
    const g = new THREE.Group();
    const pedestal = new THREE.Mesh(new THREE.CylinderGeometry(0.18, 0.24, 0.5, 12), mat('#cbd5e0'));
    pedestal.position.y = -0.42;
    const basin = new THREE.Mesh(new THREE.CylinderGeometry(0.62, 0.4, 0.32, 16), mat(c));
    const bowl = new THREE.Mesh(new THREE.CylinderGeometry(0.5, 0.34, 0.1, 16), mat('#bee3f8'));
    bowl.position.y = 0.13;
    const stem = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.06, 0.42, 8), mat('#a0aec0', { metalness: 0.7, roughness: 0.25 }));
    stem.position.set(0, 0.35, 0);
    const spout = new THREE.Mesh(new THREE.TorusGeometry(0.15, 0.045, 8, 12, Math.PI), mat('#a0aec0', { metalness: 0.7, roughness: 0.25 }));
    spout.position.set(0.14, 0.55, 0);
    const handle = new THREE.Mesh(new THREE.SphereGeometry(0.06, 8, 6), mat('#4fd1c5'));
    handle.position.set(-0.14, 0.5, 0);
    g.add(pedestal, basin, bowl, stem, spout, handle);
    return g;
  },
  footmat(c) { // 발판 (신발 신는 자리)
    const g = new THREE.Group();
    const base = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.08, 0.95), mat(c));
    const rim = new THREE.Mesh(new THREE.BoxGeometry(1.56, 0.05, 1.0), mat('#4a5568'));
    rim.position.y = -0.04;
    [-0.3, 0.3].forEach(x => {
      const foot = new THREE.Mesh(new THREE.CapsuleGeometry(0.13, 0.3, 4, 8), mat('#f7fafc'));
      foot.rotation.x = Math.PI / 2; foot.position.set(x, 0.06, 0);
      foot.scale.set(0.8, 1, 0.5);
      g.add(foot);
    });
    g.add(base, rim);
    return g;
  },
  plate(c) {
    const g = new THREE.Group();
    const dish = new THREE.Mesh(new THREE.CylinderGeometry(0.75, 0.55, 0.12, 20), mat(c));
    const inner = new THREE.Mesh(new THREE.CylinderGeometry(0.55, 0.5, 0.05, 20), mat('#e2e8f0'));
    inner.position.y = 0.05;
    g.add(dish, inner);
    return g;
  },
  desk(c) {
    const g = new THREE.Group();
    const top = new THREE.Mesh(new THREE.BoxGeometry(1.5, 0.1, 0.9), mat(c));
    top.position.y = 0.4;
    [[-0.65, -0.35], [0.65, -0.35], [-0.65, 0.35], [0.65, 0.35]].forEach(([x, z]) => {
      const leg = new THREE.Mesh(new THREE.CylinderGeometry(0.05, 0.05, 0.9, 8), mat('#718096'));
      leg.position.set(x, -0.05, z);
      g.add(leg);
    });
    g.add(top);
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

  const builder = BUILDERS[libKey] || (c => new THREE.Mesh(new THREE.SphereGeometry(0.5, 12, 8), mat(c)));
  inner = builder(meta.color);
  inner.scale.setScalar(meta.size * scale); // 빌더 내부 단위 ~1 → 정규화 반경으로 축소
  g.add(inner);
  g.userData.spin = inner;
  return g;
}
