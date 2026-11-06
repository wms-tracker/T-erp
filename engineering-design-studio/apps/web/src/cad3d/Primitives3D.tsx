import React from "react";
import type { ObjectDataModel } from "@eds/schema";
import * as THREE from "three";

/**
 * Shared world convention for this app: the data model's (x, y) is the horizontal floor plane
 * and z is elevation off the floor. Three.js is Y-up, so every mesh maps data (x, y, z) ->
 * three (x, z + height/2, y) — i.e. the object's vertical extent is centred on its elevation.
 */
export function toThreePosition(obj: ObjectDataModel): [number, number, number] {
  return [obj.position.x, obj.position.z + obj.dimension.height / 2, obj.position.y];
}

interface PrimitiveProps {
  obj: ObjectDataModel;
  selected: boolean;
  onSelect: (shiftKey: boolean) => void;
}

export function Box3D({ obj, selected, onSelect }: PrimitiveProps) {
  const { length, width, height } = obj.dimension;
  const color = new THREE.Color(obj.color ?? "#8aa2c8");
  return (
    <mesh
      position={toThreePosition(obj)}
      rotation={[0, ((obj.rotation.z ?? 0) * Math.PI) / 180, 0]}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.nativeEvent.shiftKey);
      }}
    >
      <boxGeometry args={[length, height, width]} />
      <meshStandardMaterial
        color={color}
        emissive={selected ? "#4da3ff" : "#000000"}
        emissiveIntensity={selected ? 0.35 : 0}
        metalness={obj.metalness ?? 0.1}
        roughness={obj.roughness ?? 0.7}
      />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.BoxGeometry(length, height, width)]} />
          <lineBasicMaterial color="#4da3ff" />
        </lineSegments>
      )}
    </mesh>
  );
}

export function Cylinder3D({ obj, selected, onSelect }: PrimitiveProps) {
  const radius = obj.dimension.length / 2;
  const { height } = obj.dimension;
  const color = new THREE.Color(obj.color ?? "#c8a06a");
  return (
    <mesh
      position={toThreePosition(obj)}
      onClick={(e) => {
        e.stopPropagation();
        onSelect(e.nativeEvent.shiftKey);
      }}
    >
      <cylinderGeometry args={[radius, radius, height, 32]} />
      <meshStandardMaterial
        color={color}
        emissive={selected ? "#4da3ff" : "#000000"}
        emissiveIntensity={selected ? 0.35 : 0}
        metalness={obj.metalness ?? 0.1}
        roughness={obj.roughness ?? 0.6}
      />
      {selected && (
        <lineSegments>
          <edgesGeometry args={[new THREE.CylinderGeometry(radius, radius, height, 32)]} />
          <lineBasicMaterial color="#4da3ff" />
        </lineSegments>
      )}
    </mesh>
  );
}
