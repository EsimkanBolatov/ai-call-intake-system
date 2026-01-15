export const fetchDashboardStats = async () => {
  // Mock data
  return {
    totalCases: 1250,
    pending: 45,
    resolved: 980,
    highPriority: 120,
    fire: 45,
    emergency: 32,
    ambulance: 78,
    police: 120,
    other: 25,
  };
};
