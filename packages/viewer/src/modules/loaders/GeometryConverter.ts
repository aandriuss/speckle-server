import { NodeData } from '../..'
import { GeometryData } from '../converter/Geometry'

export enum SpeckleType {
  View3D = 'View3D',
  BlockInstance = 'BlockInstance',
  Pointcloud = 'Pointcloud',
  Brep = 'Brep',
  Mesh = 'Mesh',
  Point = 'Point',
  Line = 'Line',
  Polyline = 'Polyline',
  Box = 'Box',
  Polycurve = 'Polycurve',
  Curve = 'Curve',
  Circle = 'Circle',
  Arc = 'Arc',
  Ellipse = 'Ellipse',
  RevitInstance = 'RevitInstance',
  Text = 'Text',
  Unknown = 'Unknown'
}

export const SpeckleTypeAllRenderables: SpeckleType[] = [
  SpeckleType.Pointcloud,
  SpeckleType.Brep,
  SpeckleType.Mesh,
  SpeckleType.Point,
  SpeckleType.Line,
  SpeckleType.Polyline,
  SpeckleType.Box,
  SpeckleType.Polycurve,
  SpeckleType.Curve,
  SpeckleType.Circle,
  SpeckleType.Arc,
  SpeckleType.Ellipse,
  SpeckleType.Text
]

export abstract class GeometryConverter {
  public abstract getSpeckleType(node: NodeData): SpeckleType
  public abstract convertNodeToGeometryData(node: NodeData): GeometryData
  public abstract disposeNodeGeometryData(node: NodeData): void
}
