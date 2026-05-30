import { Request, Response } from 'express';

export const getGrowthHistory = async (
  req: Request,
  res: Response
) => {
  try {

    // Example dynamic data
    // Replace with real DB queries later

    const history = [
      { day: 'Mon', value: 10 },
      { day: 'Tue', value: 25 },
      { day: 'Wed', value: 20 },
      { day: 'Thu', value: 45 },
      { day: 'Fri', value: 35 },
      { day: 'Sat', value: 60 },
      { day: 'Sun', value: 55 },
    ];

    const growthPercentage = 12.5;

    return res.status(200).json({
      success: true,
      data: {
        growth_percentage: growthPercentage,
        history,
      },
    });

  } catch (error) {

    console.error(error);

    return res.status(500).json({
      success: false,
      message: 'Failed to fetch growth history',
    });
  }
};