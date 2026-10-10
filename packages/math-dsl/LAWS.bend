import Base
import ./math.bend as Math

law squares_by_multiplication:
  for x: U32
  {Math.square(x) == (x * x : U32) : U32}
